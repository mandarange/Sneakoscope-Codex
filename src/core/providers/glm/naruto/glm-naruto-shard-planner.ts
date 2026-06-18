import type { GlmNarutoShard, GlmNarutoWorkGraph, GlmNarutoPatchStrategy } from './glm-naruto-types.js';
import { NARUTO_PATCH_STRATEGIES, GLM_NARUTO_DEFAULTS } from './glm-naruto-types.js';

export interface ShardPlanEntry {
  readonly shard: GlmNarutoShard;
  readonly strategies: readonly GlmNarutoPatchStrategy[];
  readonly candidate_count: number;
}

export function planShardCandidates(graph: GlmNarutoWorkGraph): readonly ShardPlanEntry[] {
  return graph.shards
    .filter((shard) => shard.mutable)
    .map((shard) => {
      const strategies = assignStrategies(shard);
      return {
        shard,
        strategies,
        candidate_count: shard.patches_per_shard
      };
    });
}

function assignStrategies(shard: GlmNarutoShard): readonly GlmNarutoPatchStrategy[] {
  const base = Math.max(0, NARUTO_PATCH_STRATEGIES.indexOf(shard.strategy));
  const result: GlmNarutoPatchStrategy[] = [shard.strategy];
  for (let i = 1; i < shard.patches_per_shard && i < NARUTO_PATCH_STRATEGIES.length; i++) {
    const next = NARUTO_PATCH_STRATEGIES[(base + i) % NARUTO_PATCH_STRATEGIES.length] || 'minimal_patch';
    if (!result.includes(next)) result.push(next);
  }
  return result;
}

export function computeInitialLaneMix(graph: GlmNarutoWorkGraph): {
  readonly patch_workers: number;
  readonly scouts: number;
  readonly verifiers: number;
} {
  const mutable = graph.mutable_shards.length;
  const total = Math.max(mutable, GLM_NARUTO_DEFAULTS.safe_active_start);
  const patchWorkers = Math.ceil(total * GLM_NARUTO_DEFAULTS.patch_worker_ratio);
  const scouts = Math.max(0, Math.floor(total * GLM_NARUTO_DEFAULTS.scout_ratio));
  const verifiers = Math.max(1, total - patchWorkers - scouts);
  return { patch_workers: patchWorkers, scouts, verifiers };
}
