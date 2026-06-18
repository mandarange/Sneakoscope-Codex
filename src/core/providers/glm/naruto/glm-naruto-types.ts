import type { OpenRouterReasoningEffort } from '../../openrouter/openrouter-types.js';
import { GLM_52_OPENROUTER_MODEL } from '../glm-52-settings.js';

export type GlmNarutoWorkKind =
  | 'file_patch'
  | 'test_fix'
  | 'type_fix'
  | 'doc_patch'
  | 'config_patch'
  | 'refactor_slice'
  | 'integration_repair'
  | 'verification'
  | 'merge_judge'
  | 'finalizer';

export type GlmNarutoRole = 'patch_worker' | 'scout' | 'verifier' | 'repair' | 'judge' | 'finalizer';

export type GlmNarutoIsolation = 'git-worktree' | 'patch-envelope';

export type GlmNarutoPatchStrategy =
  | 'minimal_patch'
  | 'test_first_fix'
  | 'type_safe_fix'
  | 'refactor_local'
  | 'defensive_fix';

export type GlmNarutoEnvelopeStatus = 'candidate' | 'gate_passed' | 'gate_failed' | 'superseded' | 'selected';

export type GlmNarutoTerminalState =
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'timeout'
  | 'cancelled'
  | 'budget_exhausted'
  | 'partial_candidates';

export type GlmNarutoReasoningEffort = 'none' | 'minimal' | 'low' | 'high' | 'xhigh';

export interface GlmNarutoShard {
  readonly id: string;
  readonly kind: GlmNarutoWorkKind;
  readonly task: string;
  readonly target_paths: readonly string[];
  readonly forbidden_paths: readonly string[];
  readonly base_digest: string;
  readonly strategy: GlmNarutoPatchStrategy;
  readonly patches_per_shard: number;
  readonly max_tokens: number;
  readonly reasoning: GlmNarutoReasoningEffort;
  readonly mutable: boolean;
}

export interface GlmNarutoDependency {
  readonly from: string;
  readonly to: string;
  readonly kind: 'blocks' | 'informs' | 'verifies';
}

export interface GlmNarutoParallelGroup {
  readonly id: string;
  readonly shard_ids: readonly string[];
  readonly parallel: true;
}

export interface GlmNarutoWorkGraph {
  readonly schema: 'sks.glm-naruto-work-graph.v1';
  readonly mission_id: string;
  readonly task: string;
  readonly shards: readonly GlmNarutoShard[];
  readonly dependencies: readonly GlmNarutoDependency[];
  readonly parallel_groups: readonly GlmNarutoParallelGroup[];
  readonly mutable_shards: readonly string[];
  readonly verification_shards: readonly string[];
}

export interface GlmNarutoPatchEnvelope {
  readonly schema: 'sks.glm-naruto-patch-envelope.v1';
  readonly mission_id: string;
  readonly worker_id: string;
  readonly shard_id: string;
  readonly base_digest: string;
  readonly target_paths: readonly string[];
  readonly patch: string;
  readonly patch_sha256: string;
  readonly model: typeof GLM_52_OPENROUTER_MODEL;
  readonly provider: 'openrouter';
  readonly reasoning_effort: GlmNarutoReasoningEffort | null;
  readonly gpt_fallback_allowed: false;
  readonly generated_at: string;
  readonly status: GlmNarutoEnvelopeStatus;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly strategy: GlmNarutoPatchStrategy;
}

export interface PatchCandidateNode {
  readonly patch_id: string;
  readonly shard_id: string;
  readonly target_paths: readonly string[];
  readonly score: number;
  readonly gate_passed: boolean;
  readonly patch_sha256: string;
}

export interface GlmNarutoConflictEdge {
  readonly left_patch_id: string;
  readonly right_patch_id: string;
  readonly reason: 'same_file' | 'same_hunk' | 'overlapping_symbol' | 'test_incompatible' | 'base_digest_mismatch';
}

export interface GlmNarutoConflictGraph {
  readonly schema: 'sks.glm-naruto-conflict-graph.v1';
  readonly nodes: readonly PatchCandidateNode[];
  readonly edges: readonly GlmNarutoConflictEdge[];
}

export type GlmNarutoMergeStrategy = 'deterministic' | 'quorum' | 'judge';

export interface GlmNarutoMergeCandidate {
  readonly patch_ids: readonly string[];
  readonly total_score: number;
  readonly conflict_free: boolean;
}

export interface GlmNarutoMergePlan {
  readonly schema: 'sks.glm-naruto-merge-plan.v1';
  readonly mission_id: string;
  readonly strategy: GlmNarutoMergeStrategy;
  readonly selected_patches: readonly string[];
  readonly candidates: readonly GlmNarutoMergeCandidate[];
  readonly rationale: string;
}

export interface GlmNarutoJudgeResult {
  readonly schema: 'sks.glm-naruto-judge.v1';
  readonly ranked_patch_ids: readonly string[];
  readonly reject_patch_ids: readonly string[];
  readonly mergeable_sets: readonly (readonly string[])[];
  readonly risks: readonly string[];
  readonly requires_repair_wave: boolean;
}

export interface GlmNarutoWorkerTrace {
  readonly worker_id: string;
  readonly shard_id: string;
  readonly strategy: GlmNarutoPatchStrategy;
  readonly model: typeof GLM_52_OPENROUTER_MODEL;
  readonly provider: 'openrouter';
  readonly session_id: string;
  readonly ttft_ms: number | null;
  readonly total_ms: number;
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly reasoning_tokens?: number;
  readonly cached_tokens?: number;
  readonly cache_write_tokens?: number;
  readonly request_cache_hit: boolean;
  readonly output_digest: string;
  readonly patch_digest: string | null;
  readonly status: string;
}

export interface GlmNarutoConcurrencyDecision {
  readonly target_active_workers: number;
  readonly burst_workers: number;
  readonly backpressure: boolean;
  readonly reason: string;
}

export interface GlmNarutoMissionResult {
  readonly schema: 'sks.glm-naruto-mission-result.v1';
  readonly ok: boolean;
  readonly status: GlmNarutoTerminalState;
  readonly mission_id: string;
  readonly task: string;
  readonly model: typeof GLM_52_OPENROUTER_MODEL;
  readonly gpt_fallback_allowed: false;
  readonly termination_reason: string;
  readonly artifact_dir?: string;
  readonly workers_started: number;
  readonly workers_completed: number;
  readonly patch_candidates: number;
  readonly gate_passed_candidates: number;
  readonly mergeable_candidates: number;
  readonly applied_patches: number;
  readonly failed_shards: number;
  readonly repair_waves: number;
  readonly budget_used_ms: number;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export const GLM_NARUTO_LIMITS = {
  max_waves_speed: 3,
  max_waves_deep: 5,
  max_wall_clock_ms: 300_000,
  max_worker_runtime_ms: 90_000,
  max_total_requests: 128,
  max_requests_per_shard: 4,
  max_no_progress_waves: 1,
  max_repeated_patch_digest: 1,
  max_repair_waves: 1,
  max_merge_attempts: 2
} as const;

export const GLM_NARUTO_DEFAULTS = {
  default_clones: 12,
  safe_active_start: 6,
  max_clones: 64,
  patch_worker_ratio: 0.70,
  scout_ratio: 0.10,
  verifier_ratio: 0.20,
  default_patches_per_shard: 2,
  critical_patches_per_shard: 3,
  default_max_tokens: 4096,
  judge_max_tokens: 8192,
  patch_temperature: 0.25,
  patch_top_p: 0.85,
  judge_temperature: 0.1,
  judge_top_p: 0.8
} as const;

export const NARUTO_PATCH_STRATEGIES: readonly GlmNarutoPatchStrategy[] = [
  'minimal_patch',
  'test_first_fix',
  'type_safe_fix',
  'refactor_local',
  'defensive_fix'
];
