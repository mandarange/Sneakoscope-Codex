// Shapes of the loop proof artifacts written by the retired SKS Loop runtime (SKS <= 8.0.4).
// The runtime is gone; these types only describe the on-disk state that the Stop hook's
// loop-continuation check and the runtime proof summary still read for old missions.

export type SksLoopStatus = 'planned' | 'queued' | 'running' | 'blocked' | 'completed' | 'failed' | 'handoff' | 'cancelled';

export interface SksLoopOwnerScope {
  files: string[];
  directories: string[];
  package_scripts: string[];
  release_gate_ids: string[];
  exclusive: boolean;
  collision_policy: 'skip' | 'wait' | 'handoff' | 'integration-only';
}

export interface SksLoopBudget {
  max_iterations: number;
  max_wall_ms: number;
  max_model_calls: number;
  max_subagents: number;
  max_tokens_estimate: number;
  max_changed_files: number;
  max_patch_bytes: number;
}

interface SksLoopHandoff {
  required: boolean;
  reason: string | null;
  artifact: string | null;
}

export interface SksLoopProof {
  schema: 'sks.loop-proof.v1';
  mission_id: string;
  loop_id: string;
  status: SksLoopStatus;
  iterations: number;
  owner_scope: SksLoopOwnerScope;
  worktree: {
    id: string | null;
    path: string | null;
    branch: string | null;
  };
  maker_result: {
    ok: boolean;
    worker_count: number;
    artifacts: string[];
    patch_candidates: string[];
    backend?: string;
    changed_files?: string[];
    runtime_proof_path?: string | null;
  };
  checker_result: {
    ok: boolean;
    worker_count: number;
    artifacts: string[];
    blockers: string[];
    backend?: string;
    checker_findings?: string[];
    fresh_session?: boolean;
    runtime_proof_path?: string | null;
  };
  gate_result: {
    ok: boolean;
    selected_gates: string[];
    passed_gates: string[];
    failed_gates: string[];
    skipped_gates: string[];
    blockers?: string[];
  };
  budget: {
    used: {
      wall_ms: number;
      model_calls: number;
      subagents: number;
      iterations: number;
      changed_files: number;
      patch_bytes: number;
    };
    max: SksLoopBudget;
  };
  changed_files: string[];
  patch_bytes: number;
  handoff: SksLoopHandoff;
  blockers: string[];
  integration_merge?: {
    ok: boolean;
    artifact_path?: string;
    applied_loops?: string[];
    conflict_loops?: string[];
    strategy_summary?: Record<string, number>;
  };
  gpt_final_arbiter?: {
    ok: boolean;
    artifact_path?: string;
    verdict?: string;
    gate_contract_path?: string;
    handled_by?: 'loop-finalizer';
  };
  side_effect_report?: {
    ok: boolean;
    artifact_path?: string;
    blockers?: string[];
  };
}

export interface SksLoopGraphProof {
  schema: 'sks.loop-graph-proof.v1';
  mission_id: string;
  ok: boolean;
  total_loops: number;
  completed_loops: number;
  blocked_loops: number;
  failed_loops: number;
  handoff_loops: number;
  parallelism: {
    max_active_loops: number;
    max_active_workers: number;
    wall_ms: number;
    sequential_estimate_ms: number;
    speedup_ratio: number;
  };
  gates: {
    selected: string[];
    passed: string[];
    failed: string[];
    skipped: string[];
  };
  blockers: string[];
  integration_merge?: {
    ok: boolean;
    artifact_path?: string;
    applied_loops?: string[];
    conflict_loops?: string[];
    strategy_summary?: Record<string, number>;
  };
  gpt_final_arbiter?: {
    ok: boolean;
    artifact_path?: string;
    verdict?: string;
    gate_contract_path?: string;
    handled_by?: 'loop-finalizer';
  };
  side_effect_report?: {
    ok: boolean;
    artifact_path?: string;
    blockers?: string[];
  };
}
