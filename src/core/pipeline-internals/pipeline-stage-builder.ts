/** Extracted stage/lane builders to keep runtime-core under the 1800-line budget. */
import { SPEED_LANE_POLICY } from '../proof-field.js';
import { OFFICIAL_SUBAGENT_EXECUTION_STAGE_ID } from '../agents/agent-schema.js';
import { normalizeOfficialSubagentPolicy, officialSubagentPipelineStage } from '../agents/agent-plan.js';
import { looksLikeCodeChangingWork, reflectionRequiredForRoute, routeRequiresSubagents } from '../routes.js';
import { classifyTaskProfile, type GateProfile, type TaskProfile } from '../runtime/task-profile.js';
import { type VerificationBudget } from '../runtime/verification-budget.js';
import { sha256 } from '../fsx.js';
import { stableDigest } from '../decisions/state.js';
import {
  EXECUTION_POLICY_REVISION,
  EXECUTION_PROFILES,
  type ExecutionPolicy,
  type ExecutionProfile,
  type JevExecutionPlan,
  MEMORY_DISPOSITIONS,
  type MemoryDisposition
} from '../decisions/types.js';

export const LIGHTWEIGHT_ROUTES = new Set(['Answer', 'DFix', 'Help', 'Wiki', 'Goal']);

export const BLOCKING_GATE_LIMITS = Object.freeze({
  passthrough: 0,
  answer: 0,
  'tiny-change': 1,
  'bounded-work': 2,
  'parallel-read': 2,
  'parallel-write': 3,
  'high-risk': 4
} satisfies Readonly<Record<TaskProfile, number>>);

function routeNeedsEngineeringSanityReview(route: any, task: any) {
  const id = String(route?.id || '');
  if (['DB', 'MadSKS'].includes(id)) return true;
  if (['Answer', 'Help', 'Wiki', 'Goal', 'Research', 'AutoResearch', 'PPT', 'ImageUXReview', 'ComputerUse', 'GX'].includes(id)) return false;
  return looksLikeCodeChangingWork(String(task || ''));
}
export const GATE_PROFILE_STAGES = Object.freeze({
  none: [],
  minimal: ['route_classification', 'listed_verification'],
  scoped: ['route_classification', 'ownership', 'listed_verification', 'honest_summary'],
  full: ['route_classification', 'ambiguity_gate', 'safety_gate', 'ownership', 'listed_verification', 'honest_summary']
} satisfies Readonly<Record<GateProfile, readonly string[]>>);

export const STAGE_BLOCKING_GATE = Object.freeze({
  ambiguity_gate: 'scope',
  safety_gate: 'safety',
  ssot_guard: 'safety',
  context7_evidence: 'safety',
  mistake_recall: 'safety',
  ownership: 'ownership',
  pipeline_plan: 'ownership',
  focused_implementation: 'ownership',
  triwiki_use_first: 'ownership',
  subagent_plan: 'ownership',
  official_subagent_execution: 'ownership',
  parent_integration: 'ownership',
  route_materialization: 'ownership',
  work_order_coverage: 'ownership',
  architecture_map_baseline: 'ownership',
  engineering_sanity_check: 'verification',
  listed_verification: 'verification',
  triwiki_validate_before_final: 'verification',
  architecture_map_review: 'verification',
  completion_proof: 'verification',
  reflection: 'verification',
  honest_summary: 'verification'
} satisfies Readonly<Record<string, 'scope' | 'safety' | 'ownership' | 'verification'>>);

/**
 * Code-owned execution stage registry. Jev receives only the profile IDs; it
 * cannot name a stage or invent a skip. Keep this registry in the existing
 * stage builder so route plans and the fast path share one owner.
 */
export const FAST_PATH_STAGE_MANIFEST = Object.freeze([
  { id: 'prefilter', required: true, read_only: true, bypassable: false },
  { id: 'jev_decision', required: true, read_only: true, bypassable: false },
  { id: 'route_classification', required: true, read_only: true, bypassable: false },
  { id: 'ownership', required: true, read_only: true, bypassable: false },
  { id: 'safety_gate', required: true, read_only: true, bypassable: false },
  { id: 'permission_gate', required: true, read_only: true, bypassable: false },
  { id: 'pipeline_plan', required: true, read_only: true, bypassable: false },
  { id: 'focused_implementation', required: true, read_only: false, bypassable: false },
  { id: 'triwiki_use_first', required: false, read_only: true, bypassable: true },
  { id: 'context7_evidence', required: false, read_only: true, bypassable: true },
  { id: 'planning_debate', required: false, read_only: true, bypassable: true },
  { id: 'mistake_recall', required: false, read_only: true, bypassable: true },
  { id: 'work_order_coverage', required: false, read_only: true, bypassable: true },
  { id: 'architecture_map_baseline', required: false, read_only: true, bypassable: true },
  { id: 'architecture_map_review', required: false, read_only: true, bypassable: true },
  { id: 'triwiki_validate_before_final', required: true, read_only: true, bypassable: false },
  { id: 'targeted_tests', required: true, read_only: true, bypassable: false },
  { id: 'listed_verification', required: true, read_only: true, bypassable: false },
  { id: 'final_seal', required: true, read_only: true, bypassable: false },
  { id: 'honest_summary', required: true, read_only: true, bypassable: false },
  { id: 'publish', required: true, read_only: false, bypassable: false },
  { id: 'align', required: true, read_only: false, bypassable: false },
  { id: 'destructive_action', required: true, read_only: false, bypassable: false }
] as const);

export const FAST_PATH_PROFILE_SKIP = Object.freeze({
  direct_fast: ['planning_debate', 'mistake_recall', 'architecture_map_baseline', 'architecture_map_review'],
  bounded_fast: ['planning_debate', 'mistake_recall'],
  parallel_fast: ['planning_debate', 'mistake_recall'],
  visual_fast: ['planning_debate', 'mistake_recall'],
  memory_fast: ['planning_debate', 'mistake_recall'],
  deep_verify: [],
  baseline: []
} satisfies Readonly<Record<ExecutionProfile, readonly string[]>>);

export function executionStageManifestDigest(): string {
  return sha256(JSON.stringify(FAST_PATH_STAGE_MANIFEST));
}

export interface ExecutionPlanCompileInput {
  requestedProfile?: unknown;
  policy?: unknown;
  baselinePlan?: string | null;
  sourceDigest?: string;
  graphDigest?: string | null;
  candidateDigest?: string;
  configDigest?: string;
  preconditionDigest?: string;
  stageManifestDigest?: string;
  stages?: readonly (string | { id?: string; status?: string; required?: boolean; read_only?: boolean; bypassable?: boolean })[];
  taskProfile?: TaskProfile;
  memoryDisposition?: MemoryDisposition;
  contextProfile?: 'none' | 'use_first' | 'hydrate_first' | 'deep';
  qaProfile?: 'minimal' | 'reduced_readonly' | 'standard' | 'deep';
  missionId?: string | null;
  turnId?: string | null;
  consent?: boolean;
  stale?: boolean;
  graphFresh?: boolean;
  sourceFresh?: boolean;
  mutation?: boolean;
  destructive?: boolean;
  permission?: boolean;
  parallelEligible?: boolean;
  enabledProfiles?: readonly ExecutionProfile[];
  now?: number;
}

const VALID_EXECUTION_POLICIES = new Set<ExecutionPolicy>(['baseline', 'observe', 'optimize']);
const VALID_EXECUTION_PROFILES = new Set<string>(EXECUTION_PROFILES);
const VALID_MEMORY_DISPOSITIONS = new Set<string>(MEMORY_DISPOSITIONS);

/**
 * Compile Jev's fixed profile into a deterministic, code-owned execution
 * plan. All safety, freshness, mutation, and stage decisions happen here.
 */
export function compileExecutionProfile(input: ExecutionPlanCompileInput = {}): JevExecutionPlan {
  const policy: ExecutionPolicy = VALID_EXECUTION_POLICIES.has(input.policy as ExecutionPolicy)
    ? input.policy as ExecutionPolicy
    : 'baseline';
  const requested = VALID_EXECUTION_PROFILES.has(String(input.requestedProfile))
    ? String(input.requestedProfile) as ExecutionProfile
    : 'baseline';
  const stages = normalizeExecutionStages(input.stages);
  const manifestDigest = input.stageManifestDigest || executionStageManifestDigest();
  const preconditionDigest = input.preconditionDigest || stableDigest({
    consent: input.consent !== false,
    stale: Boolean(input.stale),
    graph_fresh: input.graphFresh !== false,
    source_fresh: input.sourceFresh !== false,
    mutation: Boolean(input.mutation),
    destructive: Boolean(input.destructive),
    permission: input.permission !== false,
    parallel_eligible: input.parallelEligible !== false
  });
  let profile: ExecutionProfile = requested;
  let reason = 'profile_compiled';
  const unsafe = input.consent === false || input.permission === false || input.stale === true
    || input.graphFresh === false || input.sourceFresh === false || input.mutation === true || input.destructive === true;
  const profileEnabled = requested === 'baseline' || input.enabledProfiles === undefined || input.enabledProfiles.includes(requested);
  if (policy !== 'optimize' || requested === 'baseline') {
    profile = 'baseline';
    reason = policy === 'observe' ? 'observe_policy_keeps_baseline' : policy !== 'optimize' ? 'optimize_policy_disabled' : 'baseline_selected';
  } else if (!profileEnabled) {
    profile = 'baseline';
    reason = 'profile_not_measured_or_enabled';
  } else if (unsafe) {
    profile = input.mutation || input.destructive || input.stale ? 'deep_verify' : 'baseline';
    reason = input.mutation || input.destructive ? 'mutation_requires_deep_verify' : 'precondition_failed';
  } else if (requested === 'parallel_fast' && input.parallelEligible === false) {
    profile = 'bounded_fast';
    reason = 'parallel_precondition_failed';
  }
  const requiredStages = stages.filter((stage) => stage.required || !stage.bypassable).map((stage) => stage.id);
  const optionalStages = stages.filter((stage) => !stage.required && stage.bypassable).map((stage) => stage.id);
  const candidateSkips = new Set(FAST_PATH_PROFILE_SKIP[profile]);
  const skippedStages = profile === 'baseline' || profile === 'deep_verify'
    ? []
    : optionalStages.filter((id) => candidateSkips.has(id));
  const reinstatedStages = skippedStages.filter((id) => requiredStages.includes(id));
  const finalSkipped = skippedStages.filter((id) => !reinstatedStages.includes(id));
  const parallelGroups = profile === 'parallel_fast'
    ? [optionalStages.filter((id) => !finalSkipped.includes(id) && id !== 'publish' && id !== 'align').slice(0, 4)]
    : [];
  const sourceDigest = input.sourceDigest || stableDigest({ mission: input.missionId || null, turn: input.turnId || null });
  const graphDigest = input.graphDigest || null;
  const candidateDigest = input.candidateDigest || stableDigest({ profile: requested, memory: input.memoryDisposition || 'keep_baseline' });
  const configDigest = input.configDigest || stableDigest({ policy, revision: EXECUTION_POLICY_REVISION });
  const now = input.now || Date.now();
  const binding = { policy, profile, requested, sourceDigest, graphDigest, candidateDigest, configDigest, manifestDigest, preconditionDigest, requiredStages, optionalStages, finalSkipped, parallelGroups };
  return {
    schema: 'sks.jev-execution-plan.v1',
    plan_id: sha256(JSON.stringify(binding)).slice(0, 32),
    policy,
    execution_profile: profile,
    proposed_profile: requested,
    baseline_plan: input.baselinePlan || null,
    context_profile: input.contextProfile || (profile === 'deep_verify' ? 'deep' : profile === 'memory_fast' ? 'hydrate_first' : 'use_first'),
    qa_profile: input.qaProfile || (profile === 'deep_verify' ? 'deep' : profile === 'direct_fast' ? 'minimal' : 'reduced_readonly'),
    memory_mode: VALID_MEMORY_DISPOSITIONS.has(String(input.memoryDisposition)) ? input.memoryDisposition as MemoryDisposition : 'keep_baseline',
    policy_revision: EXECUTION_POLICY_REVISION,
    source_digest: sourceDigest,
    graph_digest: graphDigest,
    candidate_digest: candidateDigest,
    config_digest: configDigest,
    stage_manifest_digest: manifestDigest,
    precondition_digest: preconditionDigest,
    expires_at: now + 45_000,
    required_stages: requiredStages,
    optional_stages: optionalStages,
    skipped_stages: finalSkipped,
    reinstated_stages: reinstatedStages,
    parallel_groups: parallelGroups.filter((group) => group.length > 0),
    reason
  };
}

export function compilePipelineExecutionPlan(input: any, stages: readonly any[], taskProfile: TaskProfile, requestIntake: any, baselinePlan: string | null = null) {
  const supplied = input.executionPlan;
  const suppliedIssues = supplied ? validateExecutionPlan({ execution_plan: supplied }) : ['missing'];
  const suppliedFresh = supplied && Number(supplied.expires_at || 0) > Date.now()
    && supplied.stage_manifest_digest === (input.stageManifestDigest || executionStageManifestDigest())
    && (!input.sourceDigest || supplied.source_digest === input.sourceDigest)
    && (!input.graphDigest || supplied.graph_digest === input.graphDigest);
  if (supplied && suppliedIssues.length === 0 && suppliedFresh) return supplied;
  return compileExecutionProfile({
    requestedProfile: input.executionProfile || 'baseline', policy: input.executionPolicy || 'baseline',
    baselinePlan: input.baselinePlan || baselinePlan || null,
    sourceDigest: input.sourceDigest || requestIntake?.prompt_hash || undefined, graphDigest: input.graphDigest || null,
    candidateDigest: input.candidateDigest, configDigest: input.configDigest,
    stageManifestDigest: input.stageManifestDigest || executionStageManifestDigest(),
    stages: stages.map((stage: any) => ({ id: stage.id, required: stage.status === 'required' || stage.blocking === true,
      read_only: !['focused_implementation', 'publish', 'align', 'destructive_action'].includes(stage.id), bypassable: !stage.blocking })),
    taskProfile, memoryDisposition: input.memoryDisposition, contextProfile: input.contextProfile, qaProfile: input.qaProfile,
    missionId: input.missionId || null, turnId: input.turnId || null,
    ...(input.consent === undefined ? {} : { consent: input.consent }), ...(input.stale === undefined ? {} : { stale: input.stale }),
    ...(input.graphFresh === undefined ? {} : { graphFresh: input.graphFresh }), ...(input.sourceFresh === undefined ? {} : { sourceFresh: input.sourceFresh }),
    ...(input.mutation === undefined ? {} : { mutation: input.mutation }), ...(input.destructive === undefined ? {} : { destructive: input.destructive }),
    ...(input.permission === undefined ? {} : { permission: input.permission }), ...(input.parallelEligible === undefined ? {} : { parallelEligible: input.parallelEligible }),
    enabledProfiles: Array.isArray(input.enabledProfiles) ? input.enabledProfiles : undefined
  });
}

export function executionPlanState(plan: any = {}) {
  const execution = plan.execution_plan || {};
  return {
    execution_plan_id: execution.plan_id || null, execution_profile: execution.execution_profile || 'baseline',
    planned_stages: Array.isArray(plan.planned_stages) ? plan.planned_stages : [],
    skipped_execution_stages: Array.isArray(plan.skipped_execution_stages) ? plan.skipped_execution_stages : [],
    reinstated_execution_stages: Array.isArray(plan.reinstated_execution_stages) ? plan.reinstated_execution_stages : [],
    semantic_round_trips: Number(plan.semantic_round_trips || 0)
  };
}

export function validateExecutionPlan(plan: any = {}): string[] {
  const execution = plan.execution_plan;
  if (!execution) return [];
  const issues: string[] = [];
  if (execution.schema !== 'sks.jev-execution-plan.v1') issues.push('execution_plan.schema');
  if (!String(execution.plan_id || '').trim()) issues.push('execution_plan.plan_id');
  if (!EXECUTION_PROFILES.includes(execution.execution_profile)) issues.push('execution_plan.execution_profile');
  if (!Array.isArray(execution.required_stages) || !Array.isArray(execution.optional_stages) || !Array.isArray(execution.skipped_stages)) issues.push('execution_plan.stage_lists');
  if (!Array.isArray(execution.parallel_groups)) issues.push('execution_plan.parallel_groups');
  if (execution.skipped_stages?.some((id: any) => execution.required_stages?.includes(id))) issues.push('execution_plan.required_stage_skipped');
  if (plan.semantic_round_trips !== undefined && (!Number.isInteger(Number(plan.semantic_round_trips)) || Number(plan.semantic_round_trips) < 0)) issues.push('semantic_round_trips');
  return issues;
}

function normalizeExecutionStages(stages: ExecutionPlanCompileInput['stages']): Array<{ id: string; required: boolean; read_only: boolean; bypassable: boolean }> {
  const allowed = new Map(FAST_PATH_STAGE_MANIFEST.map((stage) => [stage.id, stage]));
  const source = stages && stages.length ? stages : FAST_PATH_STAGE_MANIFEST;
  return source.map((raw) => {
    const id = typeof raw === 'string' ? raw : String(raw.id || '');
    const registered = allowed.get(id as never);
    return {
      id,
      // These properties are code-owned. A model or caller may request a
      // profile, but it cannot turn a required mutation/safety stage into an
      // optional read-only stage by overriding the manifest.
      required: Boolean(registered?.required),
      read_only: Boolean(registered?.read_only),
      bypassable: Boolean(registered?.bypassable)
    };
  }).filter((stage) => allowed.has(stage.id as never));
}

export function selectPipelineLane(route: any, task: any, proof: any, taskProfile: TaskProfile = classifyTaskProfile(task)) {
  if (proof.attached && proof.lane) {
    return {
      lane: proof.lane,
      source: 'proof_field',
      fast_lane_allowed: Boolean(proof.fast_lane_allowed),
      reason: proof.fast_lane_allowed ? 'Proof Field allowed the fast lane.' : `Proof Field selected ${proof.lane}.`,
      blockers: proof.blockers || [],
      skip_when_fast: proof.fast_lane_allowed ? SPEED_LANE_POLICY.skip_when_fast : [],
      keep: proof.keep || SPEED_LANE_POLICY.always_keep
    };
  }
  if (taskProfile === 'passthrough' || taskProfile === 'answer') return { lane: 'no_pipeline', source: 'task_profile', fast_lane_allowed: true, reason: 'Light conversation does not create an execution pipeline.', blockers: [], skip_when_fast: [], keep: [] };
  if (route?.id === 'ComputerUse') return { lane: 'computer_use_fast_lane', source: 'route_policy', fast_lane_allowed: true, reason: 'Computer Use route is intentionally direct and defers wiki/honest checks to closeout.', blockers: [], skip_when_fast: ['planning_debate'], keep: ['focused_implementation', 'triwiki_validate_before_final', 'honest_mode'] };
  if (taskProfile === 'tiny-change') return { lane: 'minimal_change_lane', source: 'task_profile', fast_lane_allowed: true, reason: 'Tiny change uses one blocking gate and one focused check at most.', blockers: [], skip_when_fast: SPEED_LANE_POLICY.skip_when_fast, keep: ['listed_verification'] };
  if (LIGHTWEIGHT_ROUTES.has(route?.id)) return { lane: `${String(route.id).toLowerCase()}_lightweight_lane`, source: 'route_policy', fast_lane_allowed: true, reason: 'Lightweight route bypasses full mission orchestration by design.', blockers: [], skip_when_fast: SPEED_LANE_POLICY.skip_when_fast, keep: ['focused_implementation', 'listed_verification', 'honest_mode'] };
  if (routeRequiresSubagents(route, task, taskProfile)) return { lane: 'official_subagent_lane', source: 'task_profile', fast_lane_allowed: false, reason: 'Explicit Naruto or parallel work uses the Codex subagent workflow.', blockers: [], skip_when_fast: [], keep: ['subagent_plan', 'official_subagent_execution', 'parent_integration', 'listed_verification', 'honest_summary'] };
  if (taskProfile === 'high-risk') return { lane: SPEED_LANE_POLICY.full_lane, source: 'task_profile', fast_lane_allowed: false, reason: 'High-risk work uses the full risk gate profile.', blockers: [], skip_when_fast: [], keep: SPEED_LANE_POLICY.always_keep };
  return { lane: SPEED_LANE_POLICY.balanced_lane, source: 'route_policy', fast_lane_allowed: false, reason: 'Balanced parent-owned route until Proof Field proves a narrower lane.', blockers: ['proof_field_not_attached'], skip_when_fast: [], keep: SPEED_LANE_POLICY.always_keep };
}

// Stages whose only output is an artifact the strict Stop gate evaluates. The
// essential profile never evaluates them, so its plans do not list them.
export const STRICT_FINALIZATION_STAGE_IDS: ReadonlySet<string> = new Set([
  'mistake_recall',
  'work_order_coverage',
  'architecture_map_baseline',
  'architecture_map_review',
  'completion_proof',
  'reflection'
]);

export function buildPipelineStages(
  route: any,
  task: any,
  taskProfile: TaskProfile,
  gateProfile: GateProfile,
  ambiguity: any,
  lane: any,
  context7Required: any,
  officialSubagentPolicy: any = normalizeOfficialSubagentPolicy(route, task, {}),
  opts: { strictFinalization?: boolean } = {}
) {
  if (gateProfile === 'none') return [];
  const ids: string[] = [...GATE_PROFILE_STAGES[gateProfile]];
  const specializedRoute = Boolean(route?.id && !LIGHTWEIGHT_ROUTES.has(route.id) && route.id !== 'SKS');
  if (gateProfile === 'scoped' || gateProfile === 'full' || specializedRoute) ids.push('pipeline_plan', 'focused_implementation');
  if ((gateProfile === 'full' || specializedRoute) && !ids.includes('ssot_guard')) ids.push('ssot_guard');
  if (context7Required) ids.push('context7_evidence');
  if ((gateProfile === 'scoped' || gateProfile === 'full') && !LIGHTWEIGHT_ROUTES.has(route?.id)) {
    ids.push('triwiki_use_first', 'triwiki_validate_before_final', 'mistake_recall', 'work_order_coverage');
  }
  if (routeNeedsEngineeringSanityReview(route, task)) ids.push('engineering_sanity_check');
  // Architecture Map stages reuse ownership/verification buckets (no BLOCKING_GATE_LIMITS bump).
  // Answer/Help/DFix/Wiki/Goal/GX/DB exempt — same collision surface as engineering_sanity / GX tiny-change.
  if ((gateProfile === 'scoped' || gateProfile === 'full') && route?.id !== 'GX' && route?.id !== 'DB' && !LIGHTWEIGHT_ROUTES.has(route?.id)) {
    ids.push('architecture_map_baseline', 'architecture_map_review');
  }
  if (routeRequiresSubagents(route, task, taskProfile)) ids.push('subagent_plan', 'official_subagent_execution', 'parent_integration');
  if (specializedRoute) ids.push('route_materialization');
  if (specializedRoute) ids.push('completion_proof');
  if (reflectionRequiredForRoute(route)) ids.push('reflection');
  const stageIds = opts.strictFinalization === false
    ? ids.filter((id) => !STRICT_FINALIZATION_STAGE_IDS.has(id))
    : ids;

  return [...new Set(stageIds)].map((id: any) => {
    const configuredGate = (STAGE_BLOCKING_GATE as Record<string, string>)[id] || null;
    const blockingGate = configuredGate === 'safety' && gateProfile !== 'full'
      ? 'ownership'
      : configuredGate;
    const blocking = Boolean(blockingGate);
    const metadata = { blocking, blocking_gate: blocking ? blockingGate : null };
    if (id === OFFICIAL_SUBAGENT_EXECUTION_STAGE_ID) return { ...officialSubagentPipelineStage(officialSubagentPolicy), status: 'required', reason: officialSubagentPolicy.reason, ...metadata };
    if (id === 'engineering_sanity_check') {
      return {
        id,
        status: 'keep',
        reason: 'required_for_code_and_database_quality',
        checks: [
          'trace actual callers and preserve basic SOLID responsibility and dependency boundaries',
          'inspect loops, collections, resolvers, and serializers for N+1 or repeated I/O',
          'prove render, recursion, event, retry, and polling loops are bounded and cancellable',
          'reject disabled checks, swallowed errors, placeholder success, and verification bypasses',
          'for DB work, verify the existing canonical adapter and connection/pool lifecycle before changes',
          'for sensitive or multi-step DB work, verify transaction rollback, error propagation, idempotency, and post-commit invariants'
        ],
        ...metadata
      };
    }
    if (id === 'ambiguity_gate' && ambiguity?.required === false) return { id, status: 'not_applicable', reason: 'ambiguity_gate_not_required_for_entrypoint', ...metadata };
    if (id === 'ambiguity_gate' && ambiguity?.passed) return { id, status: 'passed', reason: 'ambiguity_contract_already_sealed', ...metadata };
    return { id, status: 'keep', reason: lane.fast_lane_allowed ? 'task_profile_minimal_lane' : 'required_by_task_and_route_profile', ...metadata };
  });
}

export function planVerification(route: any, task: any, proof: any, budget: VerificationBudget) {
  if (budget === 'none') return [];
  const out = new Set(proof.verification || []);
  if (budget === 'single-check') out.add('run one focused check for the changed surface');
  if (budget === 'affected') out.add('run affected tests or checks for changed files');
  if (budget === 'confidence') {
    out.add('run the focused build or typecheck for the affected package');
    out.add('run affected regression tests and the risk-specific safety check');
  }
  if (budget === 'release') {
    out.add('npm run packcheck');
    out.add('sks selftest --mock --json');
  }
  if (route?.id === 'Naruto') out.add('validate official subagent evidence and the parent integration summary');
  if (routeNeedsEngineeringSanityReview(route, task)) {
    out.add('complete the engineering sanity review for SOLID boundaries, N+1/repeated I/O, bounded loops, and verification bypasses');
  }
  if (route?.id === 'DB' || route?.id === 'MadSKS') {
    out.add('verify existing canonical DB access, pool lifecycle, and transaction integrity for sensitive or multi-step mutations');
  }
  if (reflectionRequiredForRoute(route)) out.add('sks wiki validate .sneakoscope/wiki/context-pack.json');
  return [...out];
}

export function pipelineInvariants(input: { taskProfile: TaskProfile; gateProfile: GateProfile; stages: any[]; verificationBudget: VerificationBudget }) {
  const out = ['no_unrequested_fallback_code'];
  if (input.stages.some((stage: any) => stage.id === 'engineering_sanity_check')) out.push('engineering_sanity_check');
  if (input.verificationBudget !== 'none') out.push('listed_verification');
  if (input.stages.some((stage: any) => stage.id === 'ssot_guard' && stage.status !== 'not_applicable')) out.push('ssot_guard');
  if (input.stages.some((stage: any) => stage.id === 'triwiki_validate_before_final')) out.push('triwiki_validate_before_final');
  if (input.gateProfile !== 'none') out.push('honest_summary');
  return out;
}

/** Typed coordinator contracts shared by the main thread and official child
 * preparation. They are receipts and gates, not a second orchestration engine. */
export const TASK_STATES = Object.freeze([
  'planned', 'dedup_attached', 'leased', 'running', 'awaiting_result',
  'validated', 'merge_queued', 'applied', 'verified', 'failed', 'cancelled',
  'stale', 'conflicted'
] as const);
export type TaskState = typeof TASK_STATES[number];

export interface TaskIdentity {
  project_id?: string;
  plan_id: string;
  task_id: string;
  task_key: string;
  parent_task_id: string | null;
  dependency_ids: string[];
  attempt: number;
  lease_id: string;
  fencing_token: number;
  base_snapshot_digest: string;
  authority_snapshot_id?: string;
  authority_revision?: number;
}

export interface MissionEnvelope {
  schema: 'sks.mission-envelope.v1';
  identity: TaskIdentity;
  objective: string;
  acceptance: string[];
  allowed_paths: string[];
  forbidden_paths: string[];
  tests: string[];
  deadline_ms: number | null;
  artifact_contract: string;
  authority_digest: string;
  spawn_depth?: 0 | 1;
  spawn_capability?: 'none' | 'main_only';
  message_recipients?: string[];
  message_budget?: { max_bytes: number; max_count: number; ttl_ms: number; max_hops: 1 };
}

export interface HandoffEnvelope {
  schema: 'sks.handoff-envelope.v1';
  identity: TaskIdentity;
  changed_paths: string[];
  artifact_digest: string | null;
  diff_digest: string | null;
  tests: Array<{ command: string; ok: boolean; evidence_digest?: string | null }>;
  validation: { ok: boolean; issues: string[]; schema_ok?: boolean; secret_scan_ok?: boolean; static_policy_ok?: boolean };
  conflicts: string[];
  next_action: 'merge_queued' | 'replan' | 'rebase' | 'retry' | 'discard';
  stage_ms: Record<string, number>;
  authority_digest: string;
  allowed_paths?: string[];
}

export interface AuthoritySnapshot {
  schema: 'sks.authority-snapshot.v1';
  id: string;
  revision: number;
  mode: string;
  consent: boolean;
  policy_revision: string;
  risk_tier: string;
  tool_allowlist: string[];
  data_classification: string[];
  mutation_class: string;
  allowed_paths: string[];
  digest: string;
}

export function buildAuthoritySnapshot(input: Omit<AuthoritySnapshot, 'schema' | 'id' | 'digest'> & { id?: string }): AuthoritySnapshot {
  const snapshot = {
    schema: 'sks.authority-snapshot.v1' as const,
    id: String(input.id || sha256(JSON.stringify([input.mode, input.policy_revision, input.allowed_paths])).slice(0, 24)),
    revision: Math.max(1, Math.floor(input.revision || 1)),
    mode: String(input.mode || 'SKS'),
    consent: input.consent === true,
    policy_revision: String(input.policy_revision || ''),
    risk_tier: String(input.risk_tier || 'normal'),
    tool_allowlist: [...new Set(input.tool_allowlist.map(String))].slice(0, 128),
    data_classification: [...new Set(input.data_classification.map(String))].slice(0, 16),
    mutation_class: String(input.mutation_class || 'read_only'),
    allowed_paths: [...new Set(input.allowed_paths.map(String))].slice(0, 128)
  };
  return { ...snapshot, digest: stableDigest(snapshot) };
}

export function intersectAuthorityCapabilities(input: {
  main: AuthoritySnapshot;
  roleTools?: readonly string[];
  allowedPaths?: readonly string[];
  policyTools?: readonly string[];
  leaseTools?: readonly string[];
  consent?: boolean;
}): { ok: boolean; tools: string[]; paths: string[]; authority_revision: number; blockers: string[] } {
  const blockers: string[] = [];
  const sets = [input.main.tool_allowlist, input.roleTools, input.policyTools, input.leaseTools].filter((row): row is readonly string[] => Array.isArray(row));
  const firstToolSet = sets[0];
  const tools = (firstToolSet ? [...firstToolSet].filter((tool) => sets.every((set) => set.includes(tool))) : []).sort();
  const paths = [...(input.allowedPaths || input.main.allowed_paths)].filter((path) => input.main.allowed_paths.some((allowed) => path === allowed || path.startsWith(`${allowed}/`))).slice(0, 128);
  if (input.main.consent !== true || input.consent === false) blockers.push('consent_missing');
  if (input.main.mutation_class !== 'read_only' && !tools.length) blockers.push('capability_intersection_empty');
  if ((input.allowedPaths || []).some((path) => !paths.includes(path))) blockers.push('path_outside_main_authority');
  return { ok: blockers.length === 0, tools, paths, authority_revision: input.main.revision, blockers };
}

const TASK_TRANSITIONS: Readonly<Record<TaskState, readonly TaskState[]>> = Object.freeze({
  planned: ['dedup_attached', 'leased', 'cancelled', 'failed'],
  dedup_attached: ['leased', 'cancelled', 'failed'],
  leased: ['running', 'cancelled', 'stale', 'failed'],
  running: ['awaiting_result', 'failed', 'cancelled', 'stale'],
  awaiting_result: ['validated', 'failed', 'cancelled', 'stale', 'conflicted'],
  validated: ['merge_queued', 'failed', 'stale', 'conflicted'],
  merge_queued: ['applied', 'cancelled', 'stale', 'conflicted', 'failed'],
  applied: ['verified', 'failed'],
  verified: [],
  failed: [],
  cancelled: [],
  stale: [],
  conflicted: []
});

export function canTransitionTaskState(from: TaskState, to: TaskState): boolean {
  return TASK_TRANSITIONS[from]?.includes(to) === true;
}

export function transitionTaskState(current: TaskState, next: TaskState): TaskState {
  if (!canTransitionTaskState(current, next)) throw new Error(`invalid_task_transition:${current}->${next}`);
  return next;
}

export function buildTaskKey(input: {
  projectId?: string;
  planId: string;
  taskId?: string;
  objective?: string;
  normalizedGoalDigest?: string;
  scopeDigest?: string;
  changedPathsDigest?: string;
  sourceSnapshotDigest?: string;
  requiredRole?: string;
  dependencyDigest?: string;
  baseSnapshotDigest?: string;
  dependencyIds?: readonly string[];
}): string {
  return sha256(JSON.stringify({
    project_id: String(input.projectId || ''),
    plan_id: String(input.planId || ''),
    normalized_goal_digest: input.normalizedGoalDigest || stableDigest(String(input.objective || '').trim().replace(/\s+/g, ' ').toLowerCase()),
    scope_digest: input.scopeDigest || input.changedPathsDigest || stableDigest([]),
    source_snapshot_digest: input.sourceSnapshotDigest || input.baseSnapshotDigest || null,
    required_role: String(input.requiredRole || ''),
    dependency_digest: input.dependencyDigest || stableDigest([...(input.dependencyIds || [])].map(String).sort())
  })).slice(0, 40);
}

export function buildMissionEnvelope(input: Omit<MissionEnvelope, 'schema'>): MissionEnvelope {
  const envelope: MissionEnvelope = { schema: 'sks.mission-envelope.v1', ...input, spawn_depth: 1, spawn_capability: 'none',
    objective: String(input.objective || '').slice(0, 2_000),
    acceptance: input.acceptance.slice(0, 32).map(String),
    allowed_paths: [...new Set(input.allowed_paths.map(String))].slice(0, 128),
    forbidden_paths: [...new Set(input.forbidden_paths.map(String))].slice(0, 128),
    tests: input.tests.slice(0, 32).map(String),
    deadline_ms: input.deadline_ms == null ? null : Math.max(0, Math.floor(input.deadline_ms)),
    artifact_contract: String(input.artifact_contract || '').slice(0, 512),
    message_recipients: [...new Set((input.message_recipients || []).map(String))].slice(0, 8),
    message_budget: input.message_budget ? {
      max_bytes: Math.min(16_384, Math.max(256, Math.floor(input.message_budget.max_bytes || 0))),
      max_count: Math.min(16, Math.max(0, Math.floor(input.message_budget.max_count || 0))),
      ttl_ms: Math.min(300_000, Math.max(1_000, Math.floor(input.message_budget.ttl_ms || 0))),
      max_hops: 1
    } : { max_bytes: 8_192, max_count: 8, ttl_ms: 120_000, max_hops: 1 }
  };
  if (!envelope.identity.task_key || envelope.identity.attempt < 1 || envelope.identity.fencing_token < 1) throw new Error('invalid_mission_envelope_identity');
  if (!envelope.authority_digest || envelope.objective.length === 0) throw new Error('invalid_mission_envelope');
  if (!envelope.forbidden_paths.some((value) => /(?:^|\/)(?:\.git|\.sneakoscope\/wiki|main|canonical)/i.test(value))) throw new Error('mission_envelope_canonical_write_boundary_missing');
  return envelope;
}

export function buildHandoffEnvelope(input: Omit<HandoffEnvelope, 'schema'>): HandoffEnvelope {
  const envelope: HandoffEnvelope = { schema: 'sks.handoff-envelope.v1', ...input,
    changed_paths: [...new Set(input.changed_paths.map(String))].slice(0, 128),
    conflicts: [...new Set(input.conflicts.map(String))].slice(0, 64),
    tests: input.tests.slice(0, 64),
    stage_ms: Object.fromEntries(Object.entries(input.stage_ms).slice(0, 64).map(([key, value]) => [String(key), Math.max(0, Number(value) || 0)])),
    ...(input.allowed_paths ? { allowed_paths: [...new Set(input.allowed_paths.map(String))].slice(0, 128) } : {})
  };
  if (!envelope.identity.task_key || !envelope.authority_digest) throw new Error('invalid_handoff_envelope');
  if (envelope.next_action === 'merge_queued' && (!envelope.validation.ok || envelope.conflicts.length > 0)) throw new Error('handoff_not_mergeable');
  if (envelope.allowed_paths && envelope.changed_paths.some((changed) => !envelope.allowed_paths?.some((allowed) => changed === allowed || changed.startsWith(`${allowed}/`)))) throw new Error('handoff_changed_path_outside_lease');
  if (envelope.changed_paths.some((changed) => /(?:^|\/)(?:\.git|\.sneakoscope\/wiki|main|canonical)(?:\/|$)/i.test(changed))) throw new Error('handoff_canonical_write_forbidden');
  return envelope;
}

const ACTIVE_TASKS = new Map<string, { identity: TaskIdentity; state: TaskState; expiresAt: number }>();

export interface TaskLedgerRow {
  task_key: string;
  identity: TaskIdentity;
  state: TaskState;
  expires_at: number;
}

export function attachOrCreateTask(input: {
  taskKey: string;
  planId: string;
  baseSnapshotDigest: string;
  ttlMs?: number;
  now?: number;
  retry?: boolean;
}): { identity: TaskIdentity; state: TaskState; attached: boolean } {
  const now = input.now || Date.now();
  const existing = ACTIVE_TASKS.get(input.taskKey);
  if (existing && existing.expiresAt > now && existing.state === 'verified' && input.retry !== true) {
    return { identity: { ...existing.identity }, state: 'verified', attached: true };
  }
  if (existing && existing.expiresAt > now && !['failed', 'cancelled', 'stale', 'verified'].includes(existing.state)) {
    // Attaching a duplicate must not rewind a running task to a synthetic
    // state. The caller observes the durable state and can continue from it.
    return { identity: { ...existing.identity }, state: existing.state, attached: true };
  }
  const identity: TaskIdentity = {
    plan_id: String(input.planId), task_id: sha256(`${input.taskKey}:${now}`).slice(0, 24), task_key: input.taskKey,
    parent_task_id: null, dependency_ids: [], attempt: existing ? existing.identity.attempt + 1 : 1,
    lease_id: sha256(`${input.taskKey}:lease:${now}`).slice(0, 24), fencing_token: (existing?.identity.fencing_token || 0) + 1,
    base_snapshot_digest: String(input.baseSnapshotDigest || '')
  };
  ACTIVE_TASKS.set(input.taskKey, { identity, state: 'leased', expiresAt: now + Math.max(1_000, input.ttlMs || 60_000) });
  return { identity, state: 'leased', attached: false };
}

export function fenceTaskResult(taskKey: string, fencingToken: number, leaseId: string, now = Date.now()): boolean {
  const active = ACTIVE_TASKS.get(taskKey);
  return Boolean(active && active.expiresAt > now && active.identity.fencing_token === fencingToken && active.identity.lease_id === leaseId);
}

export function transitionTask(taskKey: string, next: TaskState, fencingToken: number, leaseId: string, now = Date.now()): boolean {
  const active = ACTIVE_TASKS.get(taskKey);
  if (!active || active.expiresAt <= now || active.identity.fencing_token !== fencingToken || active.identity.lease_id !== leaseId) return false;
  if (!canTransitionTaskState(active.state, next)) return false;
  active.state = next;
  return true;
}

export function taskLedgerSnapshot(now = Date.now()): TaskLedgerRow[] {
  return [...ACTIVE_TASKS.entries()]
    .filter(([, row]) => row.expiresAt > now)
    .map(([task_key, row]) => ({ task_key, identity: { ...row.identity, dependency_ids: [...row.identity.dependency_ids] }, state: row.state, expires_at: row.expiresAt }))
    .sort((a, b) => a.task_key.localeCompare(b.task_key));
}

export function restoreTaskLedger(rows: readonly TaskLedgerRow[], now = Date.now()): void {
  ACTIVE_TASKS.clear();
  for (const row of rows) {
    if (!row || !row.task_key || !row.identity || row.expires_at <= now || !TASK_STATES.includes(row.state)) continue;
    ACTIVE_TASKS.set(row.task_key, { identity: { ...row.identity, dependency_ids: [...(row.identity?.dependency_ids || [])] }, state: row.state, expiresAt: row.expires_at });
  }
}

export function clearTaskLease(taskKey: string): void {
  ACTIVE_TASKS.delete(taskKey);
}
