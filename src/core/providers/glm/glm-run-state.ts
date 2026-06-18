export type GlmRunPhase =
  | 'idle'
  | 'preflight'
  | 'context'
  | 'request'
  | 'streaming'
  | 'parse_output'
  | 'model_guard'
  | 'patch_gate'
  | 'apply_patch'
  | 'verify'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export interface GlmRunState {
  readonly run_id: string;
  readonly mission_id?: string;
  readonly phase: GlmRunPhase;
  readonly started_at: string;
  readonly updated_at: string;
  readonly turn_count: number;
  readonly tool_round_count: number;
  readonly no_progress_count: number;
  readonly repeated_output_count: number;
  readonly last_output_digest?: string;
  readonly terminal: boolean;
  readonly terminal_reason?: string;
}

export interface GlmRunTermination {
  readonly schema: 'sks.glm-run-termination.v1';
  readonly run_id: string;
  readonly terminal: true;
  readonly phase: 'completed' | 'blocked' | 'failed' | 'cancelled' | 'timeout';
  readonly reason:
    | 'completed_patch_applied'
    | 'completed_noop'
    | 'glm_loop_no_progress'
    | 'glm_loop_repeated_output'
    | 'glm_loop_max_turns'
    | 'glm_request_timeout'
    | 'glm_idle_timeout'
    | 'glm_model_mismatch'
    | 'glm_patch_gate_failed'
    | 'operator_cancelled';
  readonly turn_count: number;
  readonly wall_clock_ms: number;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export const GLM_TERMINAL_PHASES = new Set<GlmRunPhase>([
  'completed',
  'blocked',
  'failed',
  'cancelled',
  'timeout'
]);

export function isGlmTerminalPhase(phase: GlmRunPhase): boolean {
  return GLM_TERMINAL_PHASES.has(phase);
}
