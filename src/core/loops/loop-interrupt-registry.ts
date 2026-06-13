import process from 'node:process';
import { appendJsonl, readText, writeJsonAtomic } from '../fsx.js';
import { guardContextForRoute, guardedProcessKill } from '../safety/mutation-guard.js';
import { createRequestedScopeContract } from '../safety/requested-scope-contract.js';
import { loopActiveWorkerHandlesPath, loopInterruptResultPath } from './loop-artifacts.js';

export interface LoopActiveWorkerHandle {
  schema: 'sks.loop-active-worker-handle.v1';
  mission_id: string;
  loop_id: string;
  phase: 'maker' | 'checker';
  worker_id: string;
  session_id: string | null;
  pid: number | null;
  started_at: string;
  interrupt_supported: boolean;
  status: 'running' | 'interrupted' | 'completed' | 'failed';
}

export async function registerLoopActiveWorker(root: string, handle: Omit<LoopActiveWorkerHandle, 'schema' | 'started_at' | 'status'> & { started_at?: string; status?: LoopActiveWorkerHandle['status'] }): Promise<LoopActiveWorkerHandle> {
  const row: LoopActiveWorkerHandle = {
    schema: 'sks.loop-active-worker-handle.v1',
    mission_id: handle.mission_id,
    loop_id: handle.loop_id,
    phase: handle.phase,
    worker_id: handle.worker_id,
    session_id: handle.session_id,
    pid: handle.pid,
    started_at: handle.started_at || new Date().toISOString(),
    interrupt_supported: handle.interrupt_supported,
    status: handle.status || 'running'
  };
  await appendJsonl(loopActiveWorkerHandlesPath(root, handle.mission_id), row);
  return row;
}

export async function markLoopWorkerInterrupted(root: string, missionId: string, workerId: string, status: LoopActiveWorkerHandle['status'] = 'interrupted'): Promise<void> {
  const handles = await readLoopActiveWorkers(root, missionId);
  await appendJsonl(loopActiveWorkerHandlesPath(root, missionId), {
    ...(handles.find((handle) => handle.worker_id === workerId) || {
      schema: 'sks.loop-active-worker-handle.v1',
      mission_id: missionId,
      loop_id: 'unknown',
      phase: 'maker',
      session_id: null,
      pid: null,
      started_at: new Date().toISOString(),
      interrupt_supported: false
    }),
    worker_id: workerId,
    status
  });
}

export async function readLoopActiveWorkers(root: string, missionId: string): Promise<LoopActiveWorkerHandle[]> {
  const text = await readText(loopActiveWorkerHandlesPath(root, missionId), '');
  const byWorker = new Map<string, LoopActiveWorkerHandle>();
  for (const line of String(text).split(/\r?\n/).map((row) => row.trim()).filter(Boolean)) {
    try {
      const row = JSON.parse(line) as LoopActiveWorkerHandle;
      if (row?.schema === 'sks.loop-active-worker-handle.v1' && row.worker_id) byWorker.set(row.worker_id, row);
    } catch {}
  }
  return [...byWorker.values()];
}

export async function interruptLoopWorkers(input: {
  root: string;
  missionId: string;
  target: string;
  graceMs?: number;
}): Promise<{
  schema: 'sks.loop-interrupt-result.v1';
  ok: boolean;
  mission_id: string;
  target: string;
  interrupted: string[];
  failed: string[];
  handles: LoopActiveWorkerHandle[];
  blockers: string[];
}> {
  const handles = (await readLoopActiveWorkers(input.root, input.missionId))
    .filter((handle) => handle.status === 'running' && (input.target === 'all' || handle.loop_id === input.target || handle.worker_id === input.target));
  const killContract = createRequestedScopeContract({
    route: 'loop:interrupt-registry',
    userRequest: 'Terminate only registered loop worker processes for an explicit loop interrupt request.',
    projectRoot: input.root,
    overrides: { codex_app_process: true }
  });
  const killGuard = guardContextForRoute(input.root, killContract, `loop worker interrupt:${input.missionId}:${input.target}`);
  const interrupted: string[] = [];
  const failed: string[] = [];
  const blockers: string[] = [];
  for (const handle of handles) {
    if (handle.pid && handle.interrupt_supported) {
      try {
        await guardedProcessKill(killGuard, handle.pid, { signal: 'SIGTERM', confirmed: true });
        await sleep(input.graceMs ?? 250);
        if (processStillExists(handle.pid)) {
          try {
            await guardedProcessKill(killGuard, handle.pid, { signal: 'SIGKILL', confirmed: true });
          } catch {}
        }
        await markLoopWorkerInterrupted(input.root, input.missionId, handle.worker_id, 'interrupted');
        interrupted.push(handle.worker_id);
      } catch (err: unknown) {
        failed.push(handle.worker_id);
        blockers.push(`loop_worker_interrupt_failed:${handle.worker_id}:${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (handle.session_id) {
      await markLoopWorkerInterrupted(input.root, input.missionId, handle.worker_id, 'interrupted');
      interrupted.push(handle.worker_id);
    } else {
      failed.push(handle.worker_id);
      blockers.push(`loop_worker_interrupt_unsupported:${handle.worker_id}`);
    }
  }
  const result = {
    schema: 'sks.loop-interrupt-result.v1' as const,
    ok: blockers.length === 0,
    mission_id: input.missionId,
    target: input.target,
    interrupted,
    failed,
    handles,
    blockers
  };
  await writeJsonAtomic(loopInterruptResultPath(input.root, input.missionId), { ...result, generated_at: new Date().toISOString() });
  return result;
}

function processStillExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
