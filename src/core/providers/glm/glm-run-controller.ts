import path from 'node:path';
import { nowIso, randomId, writeJsonAtomic } from '../../fsx.js';
import type { GlmRunLimits } from './glm-run-timeout.js';
import { GLM_SPEED_LIMITS } from './glm-run-timeout.js';
import type { GlmRunPhase, GlmRunState, GlmRunTermination } from './glm-run-state.js';
import { isGlmTerminalPhase } from './glm-run-state.js';

export interface GlmRunController {
  readonly state: () => GlmRunState;
  readonly transition: (phase: GlmRunPhase, reason?: string) => GlmRunState;
  readonly terminate: (
    phase: GlmRunTermination['phase'],
    reason: GlmRunTermination['reason'],
    blockers?: readonly string[],
    warnings?: readonly string[]
  ) => GlmRunTermination;
}

export function createGlmRunController(input: {
  readonly runId?: string;
  readonly missionId?: string;
  readonly now?: () => string;
  readonly limits?: GlmRunLimits;
} = {}): GlmRunController {
  const clock = input.now || nowIso;
  const startedAt = clock();
  const startedMs = Date.now();
  let state: GlmRunState = {
    run_id: input.runId || `glm-${startedAt.replace(/[:.]/g, '-')}-${randomId(6)}`,
    ...(input.missionId ? { mission_id: input.missionId } : {}),
    phase: 'idle',
    started_at: startedAt,
    updated_at: startedAt,
    turn_count: 0,
    tool_round_count: 0,
    no_progress_count: 0,
    repeated_output_count: 0,
    terminal: false
  };
  const limits = input.limits || GLM_SPEED_LIMITS;
  return {
    state: () => state,
    transition: (phase, reason) => {
      if (state.terminal || isGlmTerminalPhase(state.phase)) return state;
      state = {
        ...state,
        phase,
        updated_at: clock(),
        terminal: isGlmTerminalPhase(phase),
        ...(reason ? { terminal_reason: reason } : {})
      };
      return state;
    },
    terminate: (phase, reason, blockers = [], warnings = []) => {
      state = {
        ...state,
        phase,
        updated_at: clock(),
        terminal: true,
        terminal_reason: reason
      };
      return {
        schema: 'sks.glm-run-termination.v1',
        run_id: state.run_id,
        terminal: true,
        phase,
        reason,
        turn_count: state.turn_count,
        wall_clock_ms: Math.min(Date.now() - startedMs, limits.max_wall_clock_ms),
        blockers,
        warnings
      };
    }
  };
}

export async function writeGlmRunArtifacts(input: {
  readonly cwd: string;
  readonly state: GlmRunState;
  readonly termination: GlmRunTermination;
  readonly loopGuard?: unknown;
  readonly contextOmissions?: unknown;
}): Promise<string> {
  const dir = path.join(input.cwd, '.sneakoscope', 'glm', 'runs', input.state.run_id);
  await writeJsonAtomic(path.join(dir, 'run-state.json'), input.state);
  await writeJsonAtomic(path.join(dir, 'termination.json'), input.termination);
  await writeJsonAtomic(path.join(dir, 'loop-guard.json'), input.loopGuard || { schema: 'sks.glm-loop-guard.v1', ok: true });
  await writeJsonAtomic(path.join(dir, 'context-omissions.json'), input.contextOmissions || { omitted: [] });
  return dir;
}
