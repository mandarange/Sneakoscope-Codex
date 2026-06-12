import { readJson, writeJsonAtomic } from '../fsx.js';
import { loopCheckpointPath, loopLatestCheckpointPath } from './loop-artifacts.js';

export interface SksLoopCheckpoint {
  schema: 'sks.loop-checkpoint.v1';
  mission_id: string;
  loop_id: string;
  iteration: number;
  phase: string;
  state_path: string;
  proof_path: string | null;
  resumable: boolean;
  created_at: string;
}

export async function writeLoopCheckpoint(input: Omit<SksLoopCheckpoint, 'schema' | 'created_at'> & { root: string }): Promise<SksLoopCheckpoint> {
  const checkpoint: SksLoopCheckpoint = {
    schema: 'sks.loop-checkpoint.v1',
    mission_id: input.mission_id,
    loop_id: input.loop_id,
    iteration: input.iteration,
    phase: input.phase,
    state_path: input.state_path,
    proof_path: input.proof_path,
    resumable: input.resumable,
    created_at: new Date().toISOString()
  };
  await writeJsonAtomic(loopCheckpointPath(input.root, input.mission_id, input.loop_id, input.iteration, input.phase), checkpoint);
  await writeJsonAtomic(loopLatestCheckpointPath(input.root, input.mission_id, input.loop_id), checkpoint);
  return checkpoint;
}

export async function readLatestLoopCheckpoint(root: string, missionId: string, loopId: string): Promise<SksLoopCheckpoint | null> {
  return readJson<SksLoopCheckpoint | null>(loopLatestCheckpointPath(root, missionId, loopId), null);
}
