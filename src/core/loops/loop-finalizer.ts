import { readJson, writeJsonAtomic } from '../fsx.js';
import { loopGraphProofPath, loopProofPath } from './loop-artifacts.js';
import { graphProofFromLoopProofs } from './loop-scheduler.js';
import type { SksLoopGraphProof, SksLoopNode, SksLoopPlan, SksLoopProof } from './loop-schema.js';

export async function finalizeLoopGraph(input: {
  root: string;
  plan: SksLoopPlan;
  nodes?: SksLoopNode[];
  proofs?: SksLoopProof[];
  maxActiveLoops?: number;
  maxActiveWorkers?: number;
  wallMs?: number;
}): Promise<SksLoopGraphProof> {
  const proofs = input.proofs || await Promise.all(input.plan.graph.nodes.map((node) => readJson<SksLoopProof | null>(loopProofPath(input.root, input.plan.mission_id, node.loop_id), null)));
  const realProofs = proofs.filter((proof): proof is SksLoopProof => Boolean(proof));
  const graph = graphProofFromLoopProofs({
    missionId: input.plan.mission_id,
    proofs: realProofs,
    maxActiveLoops: input.maxActiveLoops || 1,
    maxActiveWorkers: input.maxActiveWorkers || Math.max(1, realProofs.reduce((sum, proof) => sum + proof.maker_result.worker_count + proof.checker_result.worker_count, 0)),
    wallMs: input.wallMs || 1
  });
  const anyHandoff = realProofs.some((proof) => proof.handoff.required);
  const anySourceMutation = realProofs.some((proof) => proof.changed_files.length > 0);
  const finalGraph: SksLoopGraphProof = {
    ...graph,
    ok: graph.ok && !anyHandoff && (!anySourceMutation || graph.gates.selected.includes('gpt:final-arbiter')),
    blockers: [
      ...graph.blockers,
      ...(anyHandoff ? ['loop_handoff_required'] : []),
      ...(anySourceMutation && !graph.gates.selected.includes('gpt:final-arbiter') ? ['gpt_final_arbiter_missing'] : [])
    ]
  };
  await writeJsonAtomic(loopGraphProofPath(input.root, input.plan.mission_id), finalGraph);
  return finalGraph;
}
