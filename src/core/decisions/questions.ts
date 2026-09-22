import {
  CONTEXT_RELEVANCE_RUBRIC,
  DESIGN_DEFAULTS,
  KEEP_BASELINE_CHOICE,
  NEEDS_EVIDENCE_CHOICE,
  QUESTION_REVISION,
  type ContextCandidate,
  type DecisionBundle,
  type DecisionsWireRequest,
  type Entry,
  type PlanCandidate,
  type Question,
  type QuestionBinding,
  type RecoveryCandidate,
  type RoutingRoleCandidate,
  ROUTING_DIFFICULTY_RUBRIC,
  SEALED_ROUTING_MODELS
} from './types.js';
import { buildDecisionBinding, redactDecisionText } from './state.js';

const SAME_BATCH_DEPENDENCY = /\b(selected above|answer above|previous answer|the (plan|action) selected|if the (plan|action) selected)\b/i;

export const CONTEXT_RELEVANCE_LEVELS = CONTEXT_RELEVANCE_RUBRIC.length;

export function assertIndependentQuestion(instructions: string): void {
  if (SAME_BATCH_DEPENDENCY.test(instructions)) {
    throw new Error('question_depends_on_same_batch_answer');
  }
}

export function validatePlanCoverage(
  requiredSliceIds: readonly string[],
  candidate: PlanCandidate,
  allowlistedDuplicates: readonly string[] = []
): string[] {
  const required = [...requiredSliceIds].sort();
  const covered = [...candidate.sliceIds].sort();
  const issues: string[] = [];
  if (required.join('\0') !== covered.join('\0')) issues.push('slice_coverage_mismatch');
  const seen = new Map<string, number>();
  for (const group of candidate.groups) {
    for (const id of group.sliceIds) {
      seen.set(id, (seen.get(id) || 0) + 1);
    }
  }
  const grouped = [...seen.keys()].sort();
  if (grouped.join('\0') !== required.join('\0')) issues.push('group_coverage_mismatch');
  for (const [id, count] of seen) {
    if (count > 1 && !allowlistedDuplicates.includes(id)) issues.push(`duplicate_slice:${id}`);
  }
  return issues;
}

export function buildDecisionBundle(input: {
  projectId: string;
  workflowRunId: string;
  workflowRevision: string;
  sourceDigest: string;
  graphDigest: string | null;
  goal: string;
  facts?: Record<string, unknown>;
  planCandidates?: readonly PlanCandidate[];
  contextCandidates?: readonly ContextCandidate[];
  recoveryCandidates?: readonly RecoveryCandidate[];
  routingCandidates?: readonly RoutingRoleCandidate[];
  baselinePlanId?: string | null;
  requiredSliceIds?: readonly string[];
  requiredVerificationIds?: readonly string[];
  recoveryDiagnostic?: string;
}): DecisionBundle {
  const planCandidates = [...(input.planCandidates || [])];
  const contextCandidates = [...(input.contextCandidates || [])];
  const recoveryCandidates = [...(input.recoveryCandidates || [])];
  const routingCandidates = [...(input.routingCandidates || [])];
  const questions: Record<string, Question> = {};
  const questionBindings: Record<string, QuestionBinding> = {};
  const recoverySlot = recoveryCandidates.length > 0 ? 1 : 0;

  if (planCandidates.length > 1) {
    const instructions = redactDecisionText(
      `Choose an already valid plan in state.plans for the supplied task and slices. Prefer preserving quality and low elapsed time; do not remove required work. Select ${KEEP_BASELINE_CHOICE} when the supplied evidence does not distinguish the plans. Required slice IDs: ${(input.requiredSliceIds || []).join(', ') || 'none'}.`
    );
    assertIndependentQuestion(instructions);
    questions.plan = {
      type: 'choice',
      instructions,
      criteria: Object.fromEntries([
        ...planCandidates.map((plan) => [plan.id, plan.summary] as const),
        [KEEP_BASELINE_CHOICE, 'Evidence is insufficient to justify changing the baseline.']
      ])
    };
    questionBindings.plan = { kind: 'plan' };
  }

  const routedRoles = appendRoutingChoices(routingCandidates, questions, questionBindings, recoverySlot);

  for (const candidate of contextCandidates.filter((row) => !row.pinned && row.excerpt)) {
    if (Object.keys(questions).length + 2 > DESIGN_DEFAULTS.maxQuestions - recoverySlot) break;
    const keepId = `keep_${candidate.id}`;
    const keepInstructions = redactDecisionText(
      `Is the original excerpt at context.${candidate.id} (source ${candidate.sourcePath}) needed for any requirement of the stated task? Use the excerpt content; do not infer relevance from the ID.`
    );
    assertIndependentQuestion(keepInstructions);
    questions[keepId] = {
      type: 'noul',
      instructions: keepInstructions,
      criteria: {
        true: 'The excerpt contains task-relevant requirements or evidence.',
        false: 'The excerpt contains no information needed for the requested work.'
      }
    };
    questionBindings[keepId] = { kind: 'context_keep', candidateId: candidate.id };

    const scoreId = `relevance_${candidate.id}`;
    const scoreInstructions = redactDecisionText(
      `Rate the usefulness of context.${candidate.id}.excerpt from ${candidate.sourcePath} for the concrete objective, using the same task-specific rubric used for other optional evidence.`
    );
    assertIndependentQuestion(scoreInstructions);
    questions[scoreId] = {
      type: 'score',
      instructions: scoreInstructions,
      criteria: [...CONTEXT_RELEVANCE_RUBRIC]
    };
    questionBindings[scoreId] = {
      kind: 'context_relevance',
      candidateId: candidate.id,
      levelCount: CONTEXT_RELEVANCE_LEVELS
    };
  }

  appendRoutingSpeculation(routedRoles, questions, questionBindings, recoverySlot);

  if (recoveryCandidates.length > 0 && Object.keys(questions).length < DESIGN_DEFAULTS.maxQuestions) {
    const instructions = redactDecisionText(
      `Choose one already authorized recovery handler for the observed diagnostic. ${input.recoveryDiagnostic || ''} Select ${KEEP_BASELINE_CHOICE} to keep the current handler path, or ${NEEDS_EVIDENCE_CHOICE} when more evidence is required. Do not invent a command or path.`
    );
    assertIndependentQuestion(instructions);
    questions.recovery = {
      type: 'choice',
      instructions,
      criteria: Object.fromEntries([
        ...recoveryCandidates.map((row) => [row.id, row.summary] as const),
        [KEEP_BASELINE_CHOICE, 'Keep the current deterministic recovery path.'],
        [NEEDS_EVIDENCE_CHOICE, 'More evidence is required before any handler runs.']
      ])
    };
    questionBindings.recovery = { kind: 'recovery' };
  }

  const state = {
    task: { goal: redactDecisionText(input.goal, 1_200) },
    facts: {
      all_required_slices_must_be_preserved: true,
      ...(input.facts || {})
    },
    slices: (input.requiredSliceIds || []).map((id) => ({ id })),
    plans: Object.fromEntries(planCandidates.map((plan) => [plan.id, {
      worker_count: plan.workerCount,
      groups: plan.groups.map((group) => ({
        id: group.id,
        slice_ids: group.sliceIds,
        role: group.role,
        effort: group.effort
      })),
      all_required_work_preserved: true,
      required_verification_ids: plan.requiredVerificationIds
    }])),
    context: Object.fromEntries(contextCandidates.map((row) => [row.id, {
      source: row.sourcePath,
      excerpt: row.excerpt,
      fresh: row.fresh,
      pinned: row.pinned,
      reproducible: row.reproducible
    }])),
    recovery: {
      diagnostic: redactDecisionText(input.recoveryDiagnostic || '', 800),
      handlers: recoveryCandidates
    },
    routing: {
      models: Object.fromEntries(SEALED_ROUTING_MODELS.map((row) => [row.id, {
        effort: row.effort,
        summary: row.summary
      }])),
      roles: Object.fromEntries(routedRoles.map((role) => [role.id, {
        summary: redactDecisionText(role.summary, 240)
      }]))
    }
  } as unknown as Entry;

  const request: DecisionsWireRequest = {
    model: DESIGN_DEFAULTS.model,
    state,
    questions,
    provider: { zdr: true, data_collection: 'deny', allow_fallbacks: false }
  };

  return {
    binding: buildDecisionBinding({
      projectId: input.projectId,
      workflowRunId: input.workflowRunId,
      workflowRevision: input.workflowRevision,
      sourceDigest: input.sourceDigest,
      graphDigest: input.graphDigest,
      candidates: { planCandidates, contextCandidates, recoveryCandidates, routingCandidates: routedRoles },
      questions,
      requestedModel: DESIGN_DEFAULTS.model
    }),
    request,
    planCandidates,
    contextCandidates,
    recoveryCandidates,
    routingCandidates: routedRoles,
    baselinePlanId: input.baselinePlanId ?? planCandidates[0]?.id ?? null,
    questionBindings
  };
}

function questionRoom(questions: Record<string, Question>, recoverySlot: number): number {
  return DESIGN_DEFAULTS.maxQuestions - recoverySlot - Object.keys(questions).length;
}

function appendRoutingChoices(
  roles: readonly RoutingRoleCandidate[],
  questions: Record<string, Question>,
  bindings: Record<string, QuestionBinding>,
  recoverySlot: number
): RoutingRoleCandidate[] {
  const included: RoutingRoleCandidate[] = [];
  for (const role of roles) {
    if (questionRoom(questions, recoverySlot) < 1) break;
    const id = `route_${role.id}`;
    const instructions = redactDecisionText(
      `Choose the sealed model for routing.roles.${role.id} using state.task and that role summary. Prefer the fastest sealed model that can do the work. Use gpt-6-astra for judgment, ambiguity, or high-stakes work. Select ${KEEP_BASELINE_CHOICE} when the work is not distinguished. Do not invent a model.`
    );
    assertIndependentQuestion(instructions);
    questions[id] = {
      type: 'choice',
      instructions,
      criteria: {
        ...Object.fromEntries(SEALED_ROUTING_MODELS.map((row) => [row.id, row.summary])),
        [KEEP_BASELINE_CHOICE]: 'The role work is not distinguished enough to leave the baseline model.'
      }
    };
    bindings[id] = { kind: 'routing', roleId: role.id };
    included.push(role);
  }
  return included;
}

function appendRoutingSpeculation(
  roles: readonly RoutingRoleCandidate[],
  questions: Record<string, Question>,
  bindings: Record<string, QuestionBinding>,
  recoverySlot: number
): void {
  for (const role of roles) {
    if (questionRoom(questions, recoverySlot) < 1) break;
    const difficultyId = `difficulty_${role.id}`;
    const difficultyInstructions = redactDecisionText(
      `Rate the difficulty of routing.roles.${role.id} for state.task. Use only that role summary and the task.`
    );
    assertIndependentQuestion(difficultyInstructions);
    questions[difficultyId] = {
      type: 'score',
      instructions: difficultyInstructions,
      criteria: [...ROUTING_DIFFICULTY_RUBRIC]
    };
    bindings[difficultyId] = { kind: 'routing_difficulty', roleId: role.id };
    if (questionRoom(questions, recoverySlot) < 1) break;
    const riskId = `risk_${role.id}`;
    const riskInstructions = redactDecisionText(
      `Does routing.roles.${role.id} need gpt-6-astra because the work is high-stakes, ambiguous, or unsafe on a faster sealed model?`
    );
    assertIndependentQuestion(riskInstructions);
    questions[riskId] = {
      type: 'noul',
      instructions: riskInstructions,
      criteria: {
        true: 'The work needs the most capable sealed model.',
        false: 'A faster sealed model can do this work.'
      }
    };
    bindings[riskId] = { kind: 'routing_risk', roleId: role.id };
    if (questionRoom(questions, recoverySlot) < 1) break;
    const neededId = `needed_${role.id}`;
    const neededInstructions = redactDecisionText(
      `Does state.task require routing.roles.${role.id} as its own child agent? Omit the role when another listed role already covers the work.`
    );
    assertIndependentQuestion(neededInstructions);
    questions[neededId] = {
      type: 'noul',
      instructions: neededInstructions,
      criteria: {
        true: 'This role must be spawned to finish the task.',
        false: 'This role is unnecessary. The parent should not spawn it.'
      }
    };
    bindings[neededId] = { kind: 'routing_needed', roleId: role.id };
  }
}

export { QUESTION_REVISION };
