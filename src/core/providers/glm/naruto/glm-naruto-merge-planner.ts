import type { GlmNarutoCandidateScoreboard, GlmNarutoConflictGraph, GlmNarutoMergePlan, GlmNarutoMergeCandidate, GlmNarutoMergeStrategy, PatchCandidateNode } from './glm-naruto-types.js';
import { getNonConflictingSets } from './glm-naruto-conflict-graph.js';

export function planMerge(input: {
  readonly missionId: string;
  readonly graph: GlmNarutoConflictGraph;
  readonly scoreboard?: GlmNarutoCandidateScoreboard;
  readonly strategy: GlmNarutoMergeStrategy;
  readonly judgeRanking?: readonly string[];
}): GlmNarutoMergePlan {
  const scoreByPatch = new Map((input.scoreboard?.scores ?? []).map((score) => [score.patch_id, score]));
  const passedNodes = input.graph.nodes.filter((n) => n.gate_passed && !scoreByPatch.get(n.patch_id)?.disqualified);
  const filteredGraph: GlmNarutoConflictGraph = {
    ...input.graph,
    nodes: passedNodes
  };
  const nonConflictingSets = getNonConflictingSets(filteredGraph);

  const candidates: GlmNarutoMergeCandidate[] = nonConflictingSets.map((patchIds) => {
    const nodes = passedNodes.filter((n) => patchIds.includes(n.patch_id));
    const totalScore = nodes.reduce((sum, n) => sum + (scoreByPatch.get(n.patch_id)?.total_score ?? n.score), 0);
    return { patch_ids: patchIds, total_score: totalScore, conflict_free: true };
  }).filter((candidate) => candidate.patch_ids.every((id) => passedNodes.some((node) => node.patch_id === id)));

  candidates.sort((a, b) => b.total_score - a.total_score);

  let selected: readonly string[] = [];
  let rationale = '';

  if (input.strategy === 'judge' && input.judgeRanking && input.judgeRanking.length > 0) {
    const ranked = input.judgeRanking.filter((id) => passedNodes.some((n) => n.patch_id === id));
    const bestSet = candidates.find((set) => set.patch_ids.every((id) => ranked.includes(id))) || candidates[0];
    selected = bestSet ? bestSet.patch_ids : [];
    rationale = 'judge_ranked_deterministic_gated';
  } else if (input.strategy === 'quorum') {
    const quorumMap = new Map<string, number>();
    for (const node of passedNodes) {
      const key = node.shard_id;
      quorumMap.set(key, (quorumMap.get(key) || 0) + 1);
    }
    const bestSet = candidates[0];
    selected = bestSet ? bestSet.patch_ids : [];
    rationale = 'quorum_consensus_deterministic_gated';
  } else {
    const bestSet = candidates[0];
    selected = bestSet ? bestSet.patch_ids : [];
    rationale = 'highest_score_non_conflicting';
  }

  return {
    schema: 'sks.glm-naruto-merge-plan.v1',
    mission_id: input.missionId,
    strategy: input.strategy,
    selected_patches: selected,
    candidates,
    rationale
  };
}

export function scoreCandidate(input: {
  readonly node: PatchCandidateNode;
  readonly patchSize: number;
  readonly touchedPathsCount: number;
  readonly protectedPath: boolean;
  readonly testFailure: boolean;
  readonly judgeRank?: number | null;
}): number {
  let score = 0;
  if (input.node.gate_passed) score += 100;
  score -= input.patchSize / 100;
  score -= input.touchedPathsCount * 5;
  if (input.protectedPath) score -= 200;
  if (input.testFailure) score -= 50;
  if (input.judgeRank !== null && input.judgeRank !== undefined) score += Math.max(0, 50 - input.judgeRank * 10);
  return Math.round(score);
}
