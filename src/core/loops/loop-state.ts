import { appendJsonl, readJson, writeJsonAtomic } from '../fsx.js';
import { loopRunLogPath, loopStatePath } from './loop-artifacts.js';
import type { SksLoopState, SksLoopStatus } from './loop-schema.js';

export type SksLoopRunLogEventType =
  | 'loop_planned'
  | 'loop_queued'
  | 'loop_started'
  | 'loop_iteration_started'
  | 'loop_triage_completed'
  | 'loop_maker_started'
  | 'loop_maker_completed'
  | 'loop_checker_started'
  | 'loop_checker_completed'
  | 'loop_gate_started'
  | 'loop_gate_completed'
  | 'loop_blocked'
  | 'loop_handoff_required'
  | 'loop_completed'
  | 'loop_failed';

export interface SksLoopRunLogEvent {
  ts?: string;
  event_type: SksLoopRunLogEventType;
  status?: SksLoopStatus;
  message?: string;
  meta?: Record<string, unknown>;
}

export async function readLoopState(root: string, missionId: string, loopId: string): Promise<SksLoopState | null> {
  return readJson<SksLoopState | null>(loopStatePath(root, missionId, loopId), null);
}

export async function writeLoopState(root: string, state: SksLoopState): Promise<SksLoopState> {
  await writeJsonAtomic(loopStatePath(root, state.mission_id, state.loop_id), state);
  return state;
}

export async function appendLoopRunLog(root: string, missionId: string, loopId: string, event: SksLoopRunLogEvent): Promise<void> {
  await appendJsonl(loopRunLogPath(root, missionId, loopId), { ts: event.ts || new Date().toISOString(), ...event });
}

export async function updateLoopState(
  root: string,
  missionId: string,
  loopId: string,
  patch: Partial<SksLoopState>
): Promise<SksLoopState> {
  const current = await readLoopState(root, missionId, loopId);
  if (!current) throw new Error(`loop_state_missing:${loopId}`);
  const next: SksLoopState = {
    ...current,
    ...patch,
    acting_on: { ...current.acting_on, ...(patch.acting_on || {}) },
    handoff: { ...current.handoff, ...(patch.handoff || {}) },
    budget_used: { ...current.budget_used, ...(patch.budget_used || {}) },
    updated_at: new Date().toISOString()
  };
  await writeLoopState(root, next);
  return next;
}

export function initialLoopState(input: {
  missionId: string;
  loopId: string;
  files: string[];
  worktreeId?: string | null;
  branch?: string | null;
}): SksLoopState {
  return {
    schema: 'sks.loop-state.v1',
    mission_id: input.missionId,
    loop_id: input.loopId,
    status: 'planned',
    iteration: 0,
    acting_on: {
      files: input.files,
      worktree_id: input.worktreeId || null,
      branch: input.branch || null
    },
    current_phase: 'triage',
    last_action: null,
    last_gate_result: null,
    last_checker_result: null,
    blockers: [],
    handoff: {
      required: false,
      reason: null,
      artifact: null
    },
    budget_used: {
      wall_ms: 0,
      model_calls: 0,
      subagents: 0,
      iterations: 0,
      changed_files: 0,
      patch_bytes: 0
    },
    updated_at: new Date().toISOString()
  };
}
