import { readJson, writeJsonAtomic } from '../fsx.js';
import { loopGraphProofPath, loopProofPath } from './loop-artifacts.js';
import { writeLoopFinalArbiterGateContract } from './loop-final-arbiter-contract.js';
import { runLoopGptFinalArbiter } from './loop-gpt-final-arbiter.js';
import { mergeLoopWorktrees } from './loop-integration-merge.js';
import { graphProofFromLoopProofs } from './loop-scheduler.js';
import { buildLoopSideEffectReport } from './loop-side-effect-scanner.js';
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
  const integrationMerge = await mergeLoopWorktrees({
    root: input.root,
    plan: input.plan,
    proofs: realProofs
  });
  const anyHandoff = realProofs.some((proof) => proof.handoff.required);
  const anySourceMutation = realProofs.some((proof) => proof.changed_files.some((file) => !file.startsWith('.sneakoscope/')));
  const selectedGptFinal = graph.gates.selected.includes('gpt:final-arbiter');
  const contract = anySourceMutation || selectedGptFinal
    ? await writeLoopFinalArbiterGateContract(input.root, input.plan.mission_id)
    : null;
  const sideEffectReport = await buildLoopSideEffectReport({
    root: input.root,
    missionId: input.plan.mission_id,
    proofs: realProofs,
    integrationMerge
  });
  const arbiter = anySourceMutation
    ? await runLoopGptFinalArbiter({ root: input.root, plan: input.plan, proofs: realProofs, integrationMerge, sideEffectReport })
    : null;
  const blockers = [
    ...graph.blockers,
    ...(anyHandoff ? ['loop_handoff_required'] : []),
    ...(integrationMerge.ok ? [] : integrationMerge.blockers),
    ...(sideEffectReport.ok ? [] : sideEffectReport.blockers),
    ...(anySourceMutation && !arbiter ? ['gpt_final_arbiter_missing'] : []),
    ...(selectedGptFinal && anySourceMutation && (!contract || !arbiter) ? ['gpt_final_arbiter_contract_unfulfilled'] : []),
    ...(arbiter && !arbiter.ok ? ['gpt_final_arbiter_not_approved', ...arbiter.blockers] : [])
  ];
  const finalGraph: SksLoopGraphProof = {
    ...graph,
    ok: graph.ok && blockers.length === 0,
    blockers: [...new Set(blockers)],
    integration_merge: {
      ok: integrationMerge.ok,
      artifact_path: `.sneakoscope/missions/${input.plan.mission_id}/loops/integration-merge.json`,
      applied_loops: integrationMerge.applied_loops,
      conflict_loops: integrationMerge.conflict_loops,
      ...(integrationMerge.strategy_summary ? { strategy_summary: integrationMerge.strategy_summary } : {})
    },
    side_effect_report: {
      ok: sideEffectReport.ok,
      artifact_path: `.sneakoscope/missions/${input.plan.mission_id}/loops/loop-side-effect-report.json`,
      blockers: sideEffectReport.blockers
    },
    ...(arbiter ? {
      gpt_final_arbiter: {
        ok: arbiter.ok,
        artifact_path: arbiter.artifact_path,
        verdict: arbiter.verdict,
        gate_contract_path: `.sneakoscope/missions/${input.plan.mission_id}/loops/gpt-final-arbiter-gate-contract.json`,
        handled_by: 'loop-finalizer'
      }
    } : {})
  };
  await writeJsonAtomic(loopGraphProofPath(input.root, input.plan.mission_id), finalGraph);
  return finalGraph;
}
