import { GLM_NARUTO_LIMITS } from './glm-naruto-types.js';

export interface BudgetState {
  readonly missionId: string;
  readonly startedMs: number;
  readonly wavesCompleted: number;
  readonly totalRequests: number;
  readonly requestsPerShard: Map<string, number>;
  readonly noProgressWaves: number;
  readonly repairWaves: number;
  readonly mergeAttempts: number;
  readonly maxWaves: number;
}

export function createBudget(missionId: string, deep: boolean): BudgetState {
  return {
    missionId,
    startedMs: Date.now(),
    wavesCompleted: 0,
    totalRequests: 0,
    requestsPerShard: new Map(),
    noProgressWaves: 0,
    repairWaves: 0,
    mergeAttempts: 0,
    maxWaves: deep ? GLM_NARUTO_LIMITS.max_waves_deep : GLM_NARUTO_LIMITS.max_waves_speed
  };
}

export function checkBudget(budget: BudgetState): { ok: boolean; reason?: string } {
  const elapsed = Date.now() - budget.startedMs;
  if (elapsed >= GLM_NARUTO_LIMITS.max_wall_clock_ms) {
    return { ok: false, reason: 'budget_wall_clock_exceeded' };
  }
  if (budget.totalRequests >= GLM_NARUTO_LIMITS.max_total_requests) {
    return { ok: false, reason: 'budget_total_requests_exceeded' };
  }
  if (budget.wavesCompleted >= budget.maxWaves) {
    return { ok: false, reason: 'budget_max_waves_reached' };
  }
  if (budget.noProgressWaves > GLM_NARUTO_LIMITS.max_no_progress_waves) {
    return { ok: false, reason: 'budget_no_progress_waves_exceeded' };
  }
  if (budget.repairWaves > GLM_NARUTO_LIMITS.max_repair_waves) {
    return { ok: false, reason: 'budget_max_repair_waves_exceeded' };
  }
  if (budget.mergeAttempts > GLM_NARUTO_LIMITS.max_merge_attempts) {
    return { ok: false, reason: 'budget_max_merge_attempts_exceeded' };
  }
  return { ok: true };
}

export function recordRequest(budget: BudgetState, shardId: string): BudgetState {
  const newPerShard = new Map(budget.requestsPerShard);
  newPerShard.set(shardId, (newPerShard.get(shardId) || 0) + 1);
  return { ...budget, totalRequests: budget.totalRequests + 1, requestsPerShard: newPerShard };
}

export function canRequestShard(budget: BudgetState, shardId: string): boolean {
  return (budget.requestsPerShard.get(shardId) || 0) < GLM_NARUTO_LIMITS.max_requests_per_shard;
}
