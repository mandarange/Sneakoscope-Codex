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
  type RecoveryCandidate
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
  baselinePlanId?: string | null;
  requiredSliceIds?: readonly string[];
  requiredVerificationIds?: readonly string[];
  recoveryDiagnostic?: string;
}): DecisionBundle {
  const planCandidates = [...(input.planCandidates || [])];
  const contextCandidates = [...(input.contextCandidates || [])];
  const recoveryCandidates = [...(input.recoveryCandidates || [])];
  const questions: Record<string, Question> = {};
  const questionBindings: Record<string, QuestionBinding> = {};

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

  for (const candidate of contextCandidates.filter((row) => !row.pinned && row.excerpt)) {
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

  if (recoveryCandidates.length > 0) {
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
      candidates: { planCandidates, contextCandidates, recoveryCandidates },
      questions,
      requestedModel: DESIGN_DEFAULTS.model
    }),
    request,
    planCandidates,
    contextCandidates,
    recoveryCandidates,
    baselinePlanId: input.baselinePlanId ?? planCandidates[0]?.id ?? null,
    questionBindings
  };
}

export { QUESTION_REVISION };
