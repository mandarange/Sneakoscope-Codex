import type { GlmNarutoShard, GlmNarutoPatchEnvelope, GlmNarutoWorkerTrace, GlmNarutoPatchStrategy } from './glm-naruto-types.js';
import { runPatchWorker, type WorkerRunResult } from './glm-naruto-worker-runtime.js';
import { checkAndApplyGlmPatch } from '../glm-patch-apply.js';
import { evaluateGlmSpeedGate } from '../glm-speed-gate.js';
import { decideConcurrency } from './glm-naruto-concurrency-governor.js';
import { planFileLeases } from './glm-naruto-file-lease.js';
import type { GlmNarutoConcurrencyDecision } from './glm-naruto-types.js';

export interface WorkerPoolInput {
  readonly apiKey: string;
  readonly missionId: string;
  readonly cwd: string;
  readonly shards: readonly GlmNarutoShard[];
  readonly contextSummary: string;
  readonly maxWorkers: number;
  readonly workerTimeoutMs: number;
  readonly strategies: ReadonlyMap<string, readonly GlmNarutoPatchStrategy[]>;
}

export interface WorkerPoolResult {
  readonly envelopes: readonly GlmNarutoPatchEnvelope[];
  readonly traces: readonly GlmNarutoWorkerTrace[];
  readonly failedShardIds: readonly string[];
  readonly concurrencyDecisions: readonly GlmNarutoConcurrencyDecision[];
}

export async function runPatchWorkerPool(input: WorkerPoolInput): Promise<WorkerPoolResult> {
  const envelopes: GlmNarutoPatchEnvelope[] = [];
  const traces: GlmNarutoWorkerTrace[] = [];
  const failedShardIds: string[] = [];
  const concurrencyDecisions: GlmNarutoConcurrencyDecision[] = [];

  const shardPathMap = new Map<string, readonly string[]>();
  for (const shard of input.shards) {
    shardPathMap.set(shard.id, shard.target_paths);
  }
  const leases = planFileLeases(shardPathMap);

  const mutableShards = input.shards.filter((s) => s.mutable);
  const decision = decideConcurrency({
    requestedClones: input.maxWorkers,
    activeWorkers: Math.min(input.maxWorkers, mutableShards.length),
    rateLimited429: 0,
    ttftP90Ms: 0,
    failureRate: 0,
    operatorMax: input.maxWorkers
  });
  concurrencyDecisions.push(decision);

  const workerTasks: Promise<WorkerRunResult>[] = [];
  let workerIdx = 0;

  for (const shard of mutableShards) {
    const strategies = input.strategies.get(shard.id) || [shard.strategy];
    for (const strategy of strategies) {
      const workerId = `worker-${shard.id}-${strategy}-${workerIdx++}`;
      const shardWithStrategy: GlmNarutoShard = { ...shard, strategy };
      workerTasks.push(runPatchWorker({
        apiKey: input.apiKey,
        missionId: input.missionId,
        workerId,
        shard: shardWithStrategy,
        contextSummary: input.contextSummary,
        timeoutMs: input.workerTimeoutMs
      }));
    }
  }

  const results = await Promise.allSettled(workerTasks);

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.ok && result.value.envelope) {
      const gate = evaluateGlmSpeedGate(result.value.envelope.patch);
      let envelope = result.value.envelope;
      if (gate.ok) {
        const applyCheck = await checkAndApplyGlmPatch({
          cwd: input.cwd,
          patch: envelope.patch,
          apply: false
        });
        envelope = applyCheck.ok
          ? { ...envelope, status: 'gate_passed' }
          : { ...envelope, status: 'gate_failed', blockers: [applyCheck.error.code] };
      } else {
        envelope = {
          ...envelope,
          status: 'gate_failed',
          blockers: gate.checks.filter((c) => !c.ok).map((c) => c.reason || c.id)
        };
      }
      envelopes.push(envelope);
      traces.push(result.value.trace);
    } else if (result.status === 'fulfilled') {
      traces.push(result.value.trace);
      failedShardIds.push(result.value.trace.shard_id);
    } else {
      // rejected promise
      failedShardIds.push('unknown');
    }
  }

  return { envelopes, traces, failedShardIds, concurrencyDecisions };
}
