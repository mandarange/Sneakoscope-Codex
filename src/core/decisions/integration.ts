import { sha256 } from '../fsx.js';
import { resolveOpenRouterApiKey } from '../providers/openrouter/openrouter-secret-store.js';
import type { OfficialSubagentSlice } from '../subagents/official-subagent-prompt.js';
import type { BoundedTriwikiAttention } from '../subagents/triwiki-attention.js';
import { jevEnabled, readDecisionConfig } from './config.js';
import { requestOpenRouterDecision, type DecisionFetch } from './openrouter.js';
import { compileDecision } from './policy.js';
import { buildDecisionBundle, validatePlanCoverage } from './questions.js';
import { applyRecoveryEffect, listProductionRecoveryCandidates } from './recovery.js';
import { assembleRoutingSelection, buildRoutingCandidates, type RoutingRoleInput } from './routing.js';
import { buildDecisionReceipt } from './receipt.js';
import { applyOptionalContextSelection, graphFileDigest, hydrateContextCandidates, sourceSnapshotDigest } from './state.js';
import {
  DESIGN_DEFAULTS,
  POLICY_REVISION,
  UNKNOWN_USAGE,
  sealedRoutingModel,
  type BaselineReason,
  type CompiledDecision,
  type ContextCandidate,
  type DecisionBundle,
  type DecisionConfig,
  type DecisionReceipt,
  type PlanCandidate,
  type RecoveryCandidate,
  type RoutingCandidate,
  type SealedRoutingEffort
} from './types.js';

export interface DecisionTestOverrides {
  fetchImpl?: DecisionFetch;
  config?: DecisionConfig;
  observe?: (event: {
    mode: string;
    eligible: boolean;
    compiled: CompiledDecision | null;
    receipt: DecisionReceipt | null;
  }) => void;
}

let testOverrides: DecisionTestOverrides | null = null;
const appliedEffects = new Set<string>();

export function setDecisionTestOverrides(overrides: DecisionTestOverrides | null): void {
  testOverrides = overrides;
}

function activeOverrides(): DecisionTestOverrides | null {
  return process.env.SKS_JEV_DECISION_TEST_OVERRIDES === '1' ? testOverrides : null;
}

export interface OfficialSubagentDecisionInput {
  root: string;
  dir: string;
  missionId: string;
  goal: string;
  workflowRunId: string;
  workflowRevision: string;
  slices: readonly OfficialSubagentSlice[];
  requestedSource: 'operator' | 'route_contract' | 'automatic';
  requestedSubagents: number;
  massParallel?: boolean;
  routingRoles?: readonly RoutingRoleInput[];
  attention: BoundedTriwikiAttention;
  changedPaths?: readonly string[];
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  deadlineMs?: number;
  fetchImpl?: DecisionFetch;
}

export interface OfficialSubagentDecisionResult {
  compiled: CompiledDecision;
  receipt: DecisionReceipt;
  attention: BoundedTriwikiAttention;
  selectedPlan: PlanCandidate | null;
  selectedRouting: RoutingCandidate | null;
  selectedContextIds: readonly string[] | null;
  omittedRoutingRoles: readonly string[];
  llmRejudgeCalls: 0;
  bundle: DecisionBundle | null;
}

export async function decideOfficialSubagentPreparation(
  input: OfficialSubagentDecisionInput
): Promise<OfficialSubagentDecisionResult> {
  const started = Date.now();
  try {
    return await decideOfficialSubagentPreparationInner(input, started);
  } catch (error) {
    if (error instanceof Error && error.name === 'AssertionError') throw error;
    return keep(input, 'transport_error', started);
  }
}

async function decideOfficialSubagentPreparationInner(
  input: OfficialSubagentDecisionInput,
  started: number
): Promise<OfficialSubagentDecisionResult> {
  const overrides = activeOverrides();
  const env = input.env || process.env;
  const config = overrides?.config ?? await readDecisionConfig(env);
  const baseline = keep(input, 'off', started);
  if (!jevEnabled(config)) {
    overrides?.observe?.({ mode: config.mode, eligible: false, compiled: baseline.compiled, receipt: baseline.receipt });
    return baseline;
  }
  const resolved = await resolveOpenRouterApiKey({ env });
  if (!resolved.key) {
    const missing = keep(input, 'missing_key', started);
    overrides?.observe?.({ mode: config.mode, eligible: false, compiled: missing.compiled, receipt: missing.receipt });
    return missing;
  }

  const contextCandidates = config.capabilities.context.ready
    ? await hydrateContextCandidates(input.root, input.attention, input.changedPaths || [])
    : [];
  const planCandidates = config.capabilities.plan.ready && input.requestedSource === 'automatic'
    ? buildAutomaticPlanCandidates(input)
    : [];
  const routingCandidates = input.requestedSource === 'automatic'
    ? buildRoutingCandidates({ roles: input.routingRoles || [] })
    : [];
  const recoveryCandidates = config.capabilities.recovery.ready
    ? [...listProductionRecoveryCandidates()]
    : [];

  const optionalContext = contextCandidates.filter((row) => !row.pinned && row.excerpt);
  const eligible = planCandidates.length > 1 || routingCandidates.length > 0 || optionalContext.length > 0 || recoveryCandidates.length > 0;
  if (!eligible) {
    const compiled = keep(input, 'no_alternative', started);
    overrides?.observe?.({ mode: config.mode, eligible: false, compiled: compiled.compiled, receipt: compiled.receipt });
    return compiled;
  }

  const sourceDigest = await sourceSnapshotDigest(input.root);
  const graphDigest = input.attention?.snapshot_hash || await graphFileDigest(input.root);
  const bundle = buildDecisionBundle({
    projectId: sha256(input.root).slice(0, 32),
    workflowRunId: input.workflowRunId,
    workflowRevision: input.workflowRevision,
    sourceDigest,
    graphDigest,
    goal: input.goal,
    planCandidates,
    contextCandidates,
    recoveryCandidates,
    routingCandidates,
    baselinePlanId: planCandidates[0]?.id ?? null,
    requiredSliceIds: planCandidates[0]?.sliceIds ?? input.slices.map((slice) => slice.id),
    requiredVerificationIds: ['review_coverage']
  });

  const fetchImpl = input.fetchImpl || overrides?.fetchImpl;
  const transport = await requestOpenRouterDecision(bundle, {
    env,
    deadlineMs: input.deadlineMs ?? DESIGN_DEFAULTS.deadlineMs,
    ...(fetchImpl ? { fetchImpl } : {}),
    ...(input.signal ? { signal: input.signal } : {})
  });
  const compiled = transport.ok
    ? compileDecision(bundle, transport.response)
    : {
        kind: 'keep_baseline' as const,
        binding: bundle.binding,
        reason: transport.reason,
        usage: transport.usage
      };
  const applied = compiled.kind === 'apply'
    ? applyEffects(input.attention, contextCandidates, planCandidates, compiled)
    : {
        attention: input.attention,
        selectedPlan: null,
        selectedRouting: null,
        selectedContextIds: null,
        omittedRoutingRoles: [] as string[],
        consumptionEvidence: null
      };
  const receipt = buildDecisionReceipt({
    binding: bundle.binding,
    compiled,
    result: compiled.kind === 'apply' ? 'applied' : 'kept_baseline',
    reason: compiled.kind === 'apply' ? compiled.effects.map((effect) => effect.kind).join(',') : compiled.reason,
    elapsedMs: Date.now() - started,
    cacheHit: transport.ok && transport.cacheHit,
    resolvedModel: transport.ok ? transport.resolvedModel : null,
    responseId: transport.ok ? transport.responseId : null,
    consumptionEvidence: applied.consumptionEvidence,
    env
  });
  const result: OfficialSubagentDecisionResult = {
    compiled,
    receipt,
    attention: applied.attention,
    selectedPlan: applied.selectedPlan,
    selectedRouting: applied.selectedRouting,
    selectedContextIds: applied.selectedContextIds,
    omittedRoutingRoles: applied.omittedRoutingRoles,
    llmRejudgeCalls: 0,
    bundle
  };
  overrides?.observe?.({ mode: config.mode, eligible: true, compiled, receipt });
  return result;
}

/** One Decisions call for the live turn. Jev off or a missing key does not call OpenRouter. */
export async function consultJevTurnModel(input: {
  root: string;
  prompt: string;
  roleId?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ called: boolean; model: string | null; effort: SealedRoutingEffort | null; reason: string }> {
  const overrides = activeOverrides();
  const env = input.env || process.env;
  const config = overrides?.config ?? await readDecisionConfig(env);
  const none = (reason: string) => ({ called: false, model: null, effort: null, reason });
  if (!jevEnabled(config)) return none('off');
  const resolved = await resolveOpenRouterApiKey({ env });
  if (!resolved.key) return none('missing_key');
  const prompt = String(input.prompt || '').trim();
  if (!prompt) return none('empty_prompt');
  const roleId = input.roleId === 'spawn' ? 'spawn' : 'turn';
  const bundle = buildDecisionBundle({
    projectId: sha256(input.root).slice(0, 32),
    workflowRunId: roleId,
    workflowRevision: roleId,
    sourceDigest: roleId,
    graphDigest: null,
    goal: prompt,
    routingCandidates: [{ id: roleId, summary: prompt.slice(0, 240) }]
  });
  const transport = await requestOpenRouterDecision(bundle, {
    env,
    deadlineMs: DESIGN_DEFAULTS.deadlineMs,
    ...(overrides?.fetchImpl ? { fetchImpl: overrides.fetchImpl } : {})
  });
  if (!transport.ok) return { called: true, model: null, effort: null, reason: transport.reason };
  const compiled = compileDecision(bundle, transport.response);
  if (compiled.kind !== 'apply') return { called: true, model: null, effort: null, reason: compiled.reason };
  const selected = assembleRoutingSelection(compiled.effects.flatMap((effect) => (
    effect.kind === 'select_routing' ? [{ roleId: effect.roleId, model: effect.model }] : []
  )));
  const model = selected?.models[roleId] || null;
  const sealed = model ? sealedRoutingModel(model) : null;
  return { called: true, model: sealed?.id || null, effort: sealed?.effort || null, reason: sealed ? 'applied' : 'keep_baseline' };
}

export function effectAlreadyConsumed(identity: string): boolean {
  return appliedEffects.has(identity);
}

export function markEffectConsumed(identity: string): boolean {
  if (appliedEffects.has(identity)) return false;
  if (appliedEffects.size >= 256) {
    const oldest = appliedEffects.values().next().value;
    if (oldest !== undefined) appliedEffects.delete(oldest);
  }
  appliedEffects.add(identity);
  return true;
}

export async function dispatchBoundRecovery(input: {
  actionId: string;
  diagnostic: string;
  candidates: readonly RecoveryCandidate[];
  consumptionIdentity: string;
}): Promise<{ invoked: boolean; reason: string; consumptionEvidence: string | null }> {
  if (!markEffectConsumed(input.consumptionIdentity)) {
    return { invoked: false, reason: 'duplicate_delivery', consumptionEvidence: null };
  }
  const result = await applyRecoveryEffect(input);
  if (!result.ok) return { invoked: false, reason: result.reason, consumptionEvidence: null };
  return { invoked: true, reason: 'applied', consumptionEvidence: result.consumptionEvidence };
}

function applyEffects(
  attention: BoundedTriwikiAttention,
  contextCandidates: readonly ContextCandidate[],
  planCandidates: readonly PlanCandidate[],
  compiled: Extract<CompiledDecision, { kind: 'apply' }>
) {
  let nextAttention = attention;
  let selectedPlan: PlanCandidate | null = null;
  let selectedContextIds: readonly string[] | null = null;
  const evidence: string[] = [];
  const routingEffects: { roleId: string; model: string }[] = [];
  const omittedRoutingRoles: string[] = [];
  for (const effect of compiled.effects) {
    if (effect.kind === 'select_optional_context') {
      nextAttention = applyOptionalContextSelection(attention, contextCandidates, effect.keepIds);
      selectedContextIds = effect.keepIds;
      evidence.push(`context:${effect.keepIds.join(',')}`);
    }
    if (effect.kind === 'select_plan') {
      selectedPlan = planCandidates.find((row) => row.id === effect.planId) || null;
      if (selectedPlan) evidence.push(`plan:${selectedPlan.id}`);
    }
    if (effect.kind === 'select_routing') {
      routingEffects.push({ roleId: effect.roleId, model: effect.model });
    }
    if (effect.kind === 'omit_role') {
      omittedRoutingRoles.push(effect.roleId);
      evidence.push(`omit:${effect.roleId}`);
    }
  }
  const selectedRouting = assembleRoutingSelection(routingEffects);
  if (selectedRouting) {
    evidence.push(...Object.entries(selectedRouting.models).map(([roleId, model]) => `routing:${roleId}=${model}`));
  }
  return {
    attention: nextAttention,
    selectedPlan,
    selectedRouting,
    selectedContextIds,
    omittedRoutingRoles,
    consumptionEvidence: evidence.length ? evidence.join('|') : null
  };
}

function buildAutomaticPlanCandidates(input: OfficialSubagentDecisionInput): PlanCandidate[] {
  const slices = input.slices.filter((slice) => slice.id);
  const sliceIds = slices.map((slice) => slice.id);
  const workerCount = Math.max(1, input.requestedSubagents);
  if (workerCount < 2) return [];
  const verification = ['review_coverage'] as const;
  const covered = sliceIds.length > 0 ? sliceIds : ['parent_owned_decomposition'];
  const baselineGroups = slices.length > 0
    ? slices.map((slice, index) => ({
        id: `G${index + 1}`,
        sliceIds: [slice.id],
        role: slice.agent || (slice.kind === 'expert' ? 'expert' : 'worker'),
        effort: slice.kind === 'expert' ? 'max' : 'low'
      }))
    : [{ id: 'G1', sliceIds: covered, role: 'expert', effort: 'max' }];
  const baseline: PlanCandidate = {
    id: 'baseline',
    summary: sliceIds.length > 0
      ? `Execute every required slice with ${workerCount} permitted workers.`
      : `Execute the automatic parent-owned work with ${workerCount} permitted workers. The parent still decomposes slices.`,
    sliceIds: covered,
    groups: baselineGroups,
    workerCount,
    requiredVerificationIds: verification
  };
  const grouped: PlanCandidate = {
    id: 'grouped',
    summary: sliceIds.length > 0
      ? 'Execute every required slice in one permitted worker group, preserving full coverage.'
      : 'Execute the automatic parent-owned work in one permitted worker group. The parent still decomposes slices.',
    sliceIds: covered,
    groups: [{ id: 'G1', sliceIds: covered, role: 'expert', effort: 'max' }],
    workerCount: 1,
    requiredVerificationIds: verification
  };
  const candidates = [baseline, grouped].filter((candidate) => validatePlanCoverage(covered, candidate).length === 0);
  const workerCounts = new Set(candidates.map((candidate) => candidate.workerCount));
  if (candidates.length < 2 || workerCounts.size < 2) return [];
  return candidates;
}

function keep(
  input: OfficialSubagentDecisionInput,
  reason: BaselineReason,
  started: number
): OfficialSubagentDecisionResult {
  const compiled: CompiledDecision = {
    kind: 'keep_baseline',
    binding: {
      projectId: sha256(input.root).slice(0, 32),
      workflowRunId: input.workflowRunId,
      workflowRevision: input.workflowRevision,
      sourceDigest: 'uncomputed',
      graphDigest: input.attention?.snapshot_hash ?? null,
      candidateDigest: 'none',
      questionDigest: 'none',
      policyRevision: POLICY_REVISION,
      requestedModel: DESIGN_DEFAULTS.model
    },
    reason,
    usage: { ...UNKNOWN_USAGE }
  };
  return {
    compiled,
    receipt: buildDecisionReceipt({
      binding: compiled.binding,
      compiled,
      result: 'kept_baseline',
      reason,
      elapsedMs: Date.now() - started
    }),
    attention: input.attention,
    selectedPlan: null,
    selectedRouting: null,
    selectedContextIds: null,
    omittedRoutingRoles: [],
    llmRejudgeCalls: 0,
    bundle: null
  };
}
