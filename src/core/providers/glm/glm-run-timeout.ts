export interface GlmRunLimits {
  readonly max_turns: number;
  readonly max_tool_rounds: number;
  readonly max_wall_clock_ms: number;
  readonly request_timeout_ms: number;
  readonly idle_timeout_ms: number;
  readonly max_no_progress_iterations: number;
  readonly max_repeated_output: number;
  readonly max_patch_retries: number;
  readonly max_context_requests: number;
}

export const GLM_SPEED_LIMITS: GlmRunLimits = {
  max_turns: 2,
  max_tool_rounds: 0,
  max_wall_clock_ms: 90_000,
  request_timeout_ms: 45_000,
  idle_timeout_ms: 15_000,
  max_no_progress_iterations: 1,
  max_repeated_output: 1,
  max_patch_retries: 1,
  max_context_requests: 1
};

export const GLM_DEEP_LIMITS: GlmRunLimits = {
  max_turns: 4,
  max_tool_rounds: 4,
  max_wall_clock_ms: 240_000,
  request_timeout_ms: 120_000,
  idle_timeout_ms: 30_000,
  max_no_progress_iterations: 2,
  max_repeated_output: 2,
  max_patch_retries: 2,
  max_context_requests: 2
};

export function createRequestAbortController(timeoutMs: number): {
  readonly controller: AbortController;
  readonly clear: () => void;
} {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  return {
    controller,
    clear: () => clearTimeout(timeout)
  };
}
