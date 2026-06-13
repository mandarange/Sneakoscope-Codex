import { readJson, writeJsonAtomic } from '../fsx.js';
import { loopKillRequestPath, loopProofPath, loopStatePath } from './loop-artifacts.js';
import { writeLoopCheckpoint } from './loop-checkpoint.js';
import { interruptLoopWorkers } from './loop-interrupt-registry.js';
import type { SksLoopNode } from './loop-schema.js';

export interface SksLoopKillRequest {
  schema: 'sks.loop-kill-request.v1';
  mission_id: string;
  target: string;
  requested_at: string;
}

export async function writeLoopKillRequest(root: string, missionId: string, target: string): Promise<SksLoopKillRequest> {
  const request = { schema: 'sks.loop-kill-request.v1' as const, mission_id: missionId, target, requested_at: new Date().toISOString() };
  await writeJsonAtomic(loopKillRequestPath(root, missionId), request);
  await interruptLoopWorkers({ root, missionId, target }).catch(() => undefined);
  return request;
}

export async function shouldKillLoop(root: string, missionId: string, loopId: string): Promise<boolean> {
  const request = await readJson<SksLoopKillRequest | null>(loopKillRequestPath(root, missionId), null);
  return request?.target === 'all' || request?.target === loopId;
}

export async function checkpointCancelledLoop(root: string, node: SksLoopNode, iteration: number, phase: string): Promise<void> {
  await writeLoopCheckpoint({
    root,
    mission_id: node.mission_id,
    loop_id: node.loop_id,
    iteration,
    phase,
    state_path: loopStatePath(root, node.mission_id, node.loop_id),
    proof_path: loopProofPath(root, node.mission_id, node.loop_id),
    resumable: true
  });
}
