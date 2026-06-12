import { readJson } from '../fsx.js';
import { loopGraphProofPath } from './loop-artifacts.js';
import type { SksLoopGraphProof } from './loop-schema.js';

export async function readLoopGraphProof(root: string, missionId: string): Promise<SksLoopGraphProof | null> {
  return readJson<SksLoopGraphProof | null>(loopGraphProofPath(root, missionId), null);
}

export function summarizeLoopGraphProof(proof: SksLoopGraphProof | null): {
  total: number;
  running: number;
  completed: number;
  blocked: number;
  speedup_ratio: number;
  active_loop_ids: string[];
  blocked_loop_ids: string[];
} {
  if (!proof) return { total: 0, running: 0, completed: 0, blocked: 0, speedup_ratio: 0, active_loop_ids: [], blocked_loop_ids: [] };
  return {
    total: proof.total_loops,
    running: Math.max(0, proof.total_loops - proof.completed_loops - proof.blocked_loops - proof.failed_loops - proof.handoff_loops),
    completed: proof.completed_loops,
    blocked: proof.blocked_loops + proof.failed_loops + proof.handoff_loops,
    speedup_ratio: proof.parallelism.speedup_ratio,
    active_loop_ids: [],
    blocked_loop_ids: proof.blockers
  };
}
