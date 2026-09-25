/**
 * SKS Jev/OpenRouter Decisions contracts.
 * Wire names follow the inspected OpenRouter raw HTTP schema (snake_case).
 * TypeScript types do not validate HTTP JSON; runtime decoding is required.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Entry = string | Json[] | { [key: string]: Json | Entry };

export type DecisionMode = 'off' | 'jev';

export type Question =
  | { type: 'choice'; instructions: Entry; criteria: Record<string, Entry | null> }
  | { type: 'noul'; instructions: Entry; criteria?: { true: Entry; false: Entry } }
  | { type: 'score'; instructions: Entry; criteria: [Entry, Entry, ...Entry[]] };

export type Answer =
  | { type: 'choice'; choice: string; confidence?: number; probabilities?: Record<string, number> }
  | { type: 'noul'; noul: number }
  | { type: 'score'; score: number; confidence?: number; probabilities?: Record<string, number>; legend?: Record<string, Entry> };

export interface DecisionsWireProvider {
  zdr: true;
  data_collection: 'deny';
  allow_fallbacks: false;
}

export interface DecisionsWireRequest {
  model: string;
  state: Entry;
  questions: Record<string, Question>;
  provider: DecisionsWireProvider;
  session_id?: string;
}

export interface DecisionsWireUsage {
  input_tokens: number;
  output_tokens: number;
  cost?: number;
}

export interface DecisionsWireResponse {
  model: string;
  id?: string;
  provider?: string;
  answers: Record<string, Answer>;
  usage: DecisionsWireUsage;
}

export interface DecisionBinding {
  projectId: string;
  workflowRunId: string;
  workflowRevision: string;
  sourceDigest: string;
  graphDigest: string | null;
  candidateDigest: string;
  questionDigest: string;
  policyRevision: string;
  requestedModel: string;
}

export interface UsageReceipt {
  inputTokens: number | null;
  outputTokens: number | null;
  reportedCost: number | null;
  evidence: 'provider_response' | 'unknown';
}

export type DecisionEffect =
  | { kind: 'select_plan'; planId: string }
  | { kind: 'select_optional_context'; keepIds: readonly string[] }
  | { kind: 'select_routing'; roleId: string; tier: RoutingTierId }
  | { kind: 'omit_role'; roleId: string }
  | { kind: 'dispatch_recovery'; actionId: string }
  | { kind: 'select_delegation'; choice: DelegationChoice }
  | { kind: 'select_option'; questionId: string; option: string };

/**
 * A fixed-option decision SKS can hand to Jev anywhere (route, image size,
 * effort escalation, ...). SKS names every option; Jev only picks one, and an
 * unconfident answer keeps the caller's deterministic baseline.
 */
export interface OptionQuestion {
  /** Lowercase id, unique within one call: `[a-z0-9_]{1,40}`. */
  id: string;
  instructions: string;
  /** option id -> what choosing it means. Ids: `[a-z0-9_.:-]{1,40}`. */
  options: Readonly<Record<string, string>>;
  /** Facts only this question needs, placed at `state.options.<id>`. */
  state?: Readonly<Record<string, unknown>>;
}

export const OPTION_QUESTION_ID = /^[a-z0-9_]{1,40}$/;
export const OPTION_CHOICE_ID = /^[a-z0-9_.:-]{1,40}$/;

export type BaselineReason =
  | 'off'
  | 'ineligible'
  | 'no_alternative'
  | 'missing_key'
  | 'privacy_unavailable'
  | 'capability_unavailable'
  | 'unauthorized'
  | 'payment_required'
  | 'rate_limited'
  | 'circuit_open'
  | 'busy'
  | 'deadline'
  | 'cancelled'
  | 'transport_error'
  | 'invalid_response'
  | 'missing_answer'
  | 'insufficient_uncertainty'
  | 'uncertain'
  | 'keep_baseline_selected'
  | 'needs_evidence'
  | 'stale_snapshot'
  | 'unknown_model'
  | 'budget_exceeded'
  | 'promotion_required';

export type CompiledDecision =
  | {
      kind: 'apply';
      binding: DecisionBinding;
      resolvedModel: string;
      effects: readonly [DecisionEffect, ...DecisionEffect[]];
      usage: UsageReceipt;
    }
  | {
      kind: 'keep_baseline';
      binding: DecisionBinding;
      reason: BaselineReason;
      usage: UsageReceipt;
    };

export interface DecisionReceipt {
  schema: 'sks.jev-decision.v1';
  decisionId: string;
  binding: DecisionBinding;
  resolvedModel: string | null;
  responseId: string | null;
  result: 'applied' | 'kept_baseline' | 'superseded';
  reason: string;
  usage: UsageReceipt;
  elapsedMs: number;
  cacheHit: boolean;
  /** An applied saved plan is not proof of a native-host child spawn. */
  consumptionEvidence: string | null;
}

export interface PlanCandidate {
  id: string;
  summary: string;
  sliceIds: readonly string[];
  groups: readonly { id: string; sliceIds: readonly string[]; role: string; effort: string }[];
  workerCount: number;
  requiredVerificationIds: readonly string[];
}

export interface ContextCandidate {
  id: string;
  sourcePath: string;
  sourceHash: string;
  excerpt: string;
  pinned: boolean;
  fresh: boolean;
  reproducible: boolean;
}

export type SealedRoutingEffort = 'low' | 'medium' | 'high' | 'max';

export interface RoutingRoleCandidate {
  id: string;
  summary: string;
}

export interface RoutingCandidate {
  id: 'jev_role_fanout';
  summary: string;
  efforts: Readonly<Record<string, SealedRoutingEffort>>;
  models: Readonly<Record<string, string>>;
  tiers: Readonly<Record<string, RoutingTierId>>;
}

/**
 * Jev chooses a model tier, never a model name. Each tier resolves to the
 * newest model Codex lists for it (see subagents/model-tiers.ts), so Jev keeps
 * routing to the latest fast or accurate model without a policy change.
 * Order is fastest first; the last tier is the escalation tier.
 */
export const ROUTING_TIERS = Object.freeze([
  Object.freeze({ id: 'fast' as const, effort: 'low' as const, summary: 'Fastest latest model. Mechanical edits, renames, formatting, and other one-step changes.' }),
  Object.freeze({ id: 'balanced' as const, effort: 'low' as const, summary: 'Fast latest model. Simple coding whose result is already specified.' }),
  Object.freeze({ id: 'context' as const, effort: 'medium' as const, summary: 'Latest model for context and tools. Search, multi-file reading, and broad exploration.' }),
  Object.freeze({ id: 'deep' as const, effort: 'max' as const, summary: 'Escalate to the most capable latest model. Judgment, architecture, ambiguity, security, or high-stakes work.' })
]);

export type RoutingTierId = (typeof ROUTING_TIERS)[number]['id'];
export const ESCALATION_ROUTING_TIER: RoutingTierId = 'deep';

export function routingTier(value: unknown): { id: RoutingTierId; effort: SealedRoutingEffort } | null {
  const match = ROUTING_TIERS.find((row) => row.id === value);
  return match ? { id: match.id, effort: match.effort } : null;
}

export const ROUTING_DIFFICULTY_RUBRIC = Object.freeze([
  'Mechanical one-step work: rename, format, copy, or a single exact edit.',
  'Simple coding whose result is already specified.',
  'Broad context, search, or tool use across more than one file.',
  'Judgment, architecture, ambiguity, security, or other high-stakes work.'
] as const);

export const ROUTING_RISK_NOUL_MIN = 0.70;
/** Below this, the role is not needed for the task and should not be spawned. */
export const ROUTING_ROLE_OMIT_NOUL_MAX = 0.35;

/**
 * A Naruto parent tool call that would edit source before any child exists.
 * `delegate_child` keeps the deterministic gate (spawn first); `parent_owned`
 * lets this one orchestration-scope edit through without a child.
 */
export type DelegationChoice = 'delegate_child' | 'parent_owned';

export const DELEGATION_CHOICES: readonly DelegationChoice[] = Object.freeze(['delegate_child', 'parent_owned']);

export interface DelegationCandidate {
  toolName: string;
  targets: readonly string[];
  missionGoal: string;
}

export interface RecoveryCandidate {
  id: string;
  summary: string;
  handlerId: string;
  authorized: boolean;
  readOnly: boolean;
}

export type QuestionBinding =
  | { kind: 'plan' }
  | { kind: 'routing'; roleId: string }
  | { kind: 'routing_difficulty'; roleId: string }
  | { kind: 'routing_risk'; roleId: string }
  | { kind: 'routing_needed'; roleId: string }
  | { kind: 'context_keep'; candidateId: string }
  | { kind: 'context_relevance'; candidateId: string; levelCount: number }
  | { kind: 'recovery' }
  | { kind: 'delegation' }
  | { kind: 'option'; questionId: string };

export interface DecisionBundle {
  binding: DecisionBinding;
  request: DecisionsWireRequest;
  planCandidates: readonly PlanCandidate[];
  contextCandidates: readonly ContextCandidate[];
  recoveryCandidates: readonly RecoveryCandidate[];
  routingCandidates: readonly RoutingRoleCandidate[];
  delegationCandidate: DelegationCandidate | null;
  optionQuestions: readonly OptionQuestion[];
  baselinePlanId: string | null;
  /** Static code-generated mapping; never inferred by another model. */
  questionBindings: Readonly<Record<string, QuestionBinding>>;
}

export const DESIGN_DEFAULTS = Object.freeze({
  mode: 'off' as const,
  model: 'typesafe/jev-1.13',
  endpoint: 'https://openrouter.ai/api/alpha/decisions',
  deadlineMs: 1500,
  retries: 0,
  maxInFlight: 2,
  maxQueued: 0,
  maxQuestions: 32,
  maxRequestBytes: 24 * 1024,
  maxResponseBytes: 256 * 1024,
  memoEntries: 128,
  circuitFailures: 3,
  circuitOpenMs: 30000
});

export const POLICY_REVISION = 'sks.jev-policy.v2';
export const QUESTION_REVISION = 'sks.jev-questions.v1';
export const RECEIPT_SCHEMA = 'sks.jev-decision.v1' as const;

export const CHOICE_MIN_PROBABILITY = 0.85;
export const CHOICE_MIN_CONFIDENCE = 0.70;
export const CONTEXT_DROP_NOUL_MAX = 0.10;
export const DISTRIBUTION_SUM_TOLERANCE = 1e-3;
export const KEEP_BASELINE_CHOICE = 'keep_baseline';
export const NEEDS_EVIDENCE_CHOICE = 'needs_evidence';

export const CONTEXT_RELEVANCE_RUBRIC = Object.freeze([
  'No information needed for the stated task.',
  'Indirect background, with no task-specific constraint or evidence.',
  'Useful supporting evidence for at least one task requirement.',
  'Direct evidence needed to implement or verify a task requirement.'
] as const);

export interface DecisionCapabilityState {
  ready: boolean;
  promoted: boolean;
  reason: string | null;
}

export interface DecisionConfig {
  schema: 'sks.jev-decision-config.v1';
  mode: DecisionMode;
  provider: 'openrouter';
  model: string;
  consentCloud: boolean;
  consentAt: string | null;
  capabilities: {
    context: DecisionCapabilityState;
    plan: DecisionCapabilityState;
    recovery: DecisionCapabilityState;
  };
  updatedAt: string | null;
}

export const UNKNOWN_USAGE: UsageReceipt = Object.freeze({
  inputTokens: null,
  outputTokens: null,
  reportedCost: null,
  evidence: 'unknown'
});
