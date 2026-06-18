import type { GlmNarutoMergePlan, GlmNarutoJudgeResult, GlmNarutoPatchEnvelope } from './glm-naruto-types.js';
import { planMerge } from './glm-naruto-merge-planner.js';
import { buildConflictGraph } from './glm-naruto-conflict-graph.js';
import type { PatchCandidateNode } from './glm-naruto-types.js';

export function finalizeMergePlan(input: {
  readonly missionId: string;
  readonly envelopes: readonly GlmNarutoPatchEnvelope[];
  readonly judgeResult?: GlmNarutoJudgeResult;
  readonly useJudge: boolean;
  readonly xhighFinalizer: boolean;
}): GlmNarutoMergePlan {
  const passedEnvelopes = input.envelopes.filter((e) => e.status === 'gate_passed');

  const nodes: PatchCandidateNode[] = passedEnvelopes.map((env) => ({
    patch_id: env.worker_id,
    shard_id: env.shard_id,
    target_paths: env.target_paths,
    score: Math.max(0, 100 - Math.floor(env.patch.length / 100)),
    gate_passed: true,
    patch_sha256: env.patch_sha256
  }));

  const conflictGraph = buildConflictGraph(passedEnvelopes, nodes);
  const strategy = input.useJudge && input.judgeResult ? 'judge' : 'deterministic';

  return planMerge({
    missionId: input.missionId,
    graph: conflictGraph,
    strategy,
    ...(input.judgeResult ? { judgeRanking: input.judgeResult.ranked_patch_ids } : {})
  });
}
