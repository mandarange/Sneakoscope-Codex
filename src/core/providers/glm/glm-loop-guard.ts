import crypto from 'node:crypto';
import type { GlmRunLimits } from './glm-run-timeout.js';
import type { GlmRunState } from './glm-run-state.js';
import { isGlmTerminalPhase } from './glm-run-state.js';

export interface GlmLoopGuardDecision {
  readonly ok: boolean;
  readonly reason?: 'glm_loop_max_turns' | 'glm_loop_no_progress' | 'glm_loop_repeated_output' | 'terminal_state';
  readonly state: GlmRunState;
}

export function recordGlmLoopIteration(input: {
  readonly state: GlmRunState;
  readonly limits: GlmRunLimits;
  readonly output?: string;
  readonly madeProgress: boolean;
  readonly nowIso: string;
}): GlmLoopGuardDecision {
  if (isGlmTerminalPhase(input.state.phase) || input.state.terminal) {
    return { ok: false, reason: 'terminal_state', state: input.state };
  }
  const outputDigest = input.output ? digestNormalizedOutput(input.output) : input.state.last_output_digest;
  const repeated = Boolean(outputDigest && outputDigest === input.state.last_output_digest);
  const nextState: GlmRunState = {
    ...input.state,
    updated_at: input.nowIso,
    turn_count: input.state.turn_count + 1,
    no_progress_count: input.madeProgress ? 0 : input.state.no_progress_count + 1,
    repeated_output_count: repeated ? input.state.repeated_output_count + 1 : 0,
    ...(outputDigest ? { last_output_digest: outputDigest } : {})
  };
  if (nextState.turn_count > input.limits.max_turns) {
    return { ok: false, reason: 'glm_loop_max_turns', state: nextState };
  }
  if (nextState.repeated_output_count >= input.limits.max_repeated_output) {
    return { ok: false, reason: 'glm_loop_repeated_output', state: nextState };
  }
  if (nextState.no_progress_count > input.limits.max_no_progress_iterations) {
    return { ok: false, reason: 'glm_loop_no_progress', state: nextState };
  }
  return { ok: true, state: nextState };
}

export function digestNormalizedOutput(output: string): string {
  return crypto.createHash('sha256').update(output.replace(/\s+/g, ' ').trim()).digest('hex');
}
