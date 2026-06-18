import type { GlmNarutoShard, GlmNarutoPatchEnvelope } from './glm-naruto-types.js';
import { GLM_NARUTO_LIMITS } from './glm-naruto-types.js';

export interface RepairWaveInput {
  readonly failedEnvelopes: readonly GlmNarutoPatchEnvelope[];
  readonly shards: readonly GlmNarutoShard[];
  readonly repairWaveCount: number;
}

export interface RepairWaveResult {
  readonly shardsToRepair: readonly GlmNarutoShard[];
  readonly canRepair: boolean;
  readonly reason: string;
}

export function planRepairWave(input: RepairWaveInput): RepairWaveResult {
  if (input.repairWaveCount >= GLM_NARUTO_LIMITS.max_repair_waves) {
    return { shardsToRepair: [], canRepair: false, reason: 'max_repair_waves_reached' };
  }

  const failedShardIds = new Set(input.failedEnvelopes.map((e) => e.shard_id));
  const shardsToRepair = input.shards.filter((s) => failedShardIds.has(s.id));

  if (shardsToRepair.length === 0) {
    return { shardsToRepair: [], canRepair: false, reason: 'no_failed_shards_to_repair' };
  }

  return {
    shardsToRepair: shardsToRepair.map((s) => ({
      ...s,
      strategy: 'defensive_fix',
      patches_per_shard: 1
    })),
    canRepair: true,
    reason: 'repair_wave_planned'
  };
}
