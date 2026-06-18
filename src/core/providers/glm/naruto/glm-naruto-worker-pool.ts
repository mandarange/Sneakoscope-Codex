import path from 'node:path';
import { writeJsonAtomic, writeTextAtomic } from '../../../fsx.js';
import type { GlmNarutoShard, GlmNarutoPatchEnvelope, GlmNarutoWorkerTrace, GlmNarutoPatchStrategy } from './glm-naruto-types.js';
import { runPatchWorker, type WorkerRunResult } from './glm-naruto-worker-runtime.js';
import { decideConcurrency } from './glm-naruto-concurrency-governor.js';
import type { GlmNarutoConcurrencyDecision } from './glm-naruto-types.js';
import { evaluateGlmNarutoPatchCandidateGate } from './glm-naruto-patch-candidate-gate.js';
import { createPatchEnvelope } from './glm-naruto-patch-envelope.js';
import { writeGlmNarutoWorkerArtifacts } from './glm-naruto-worker-artifacts.js';
import { materializePatchViaWorktree } from './glm-naruto-worktree-worker.js';
import type { GlmNarutoIsolationMode } from './glm-naruto-isolation-policy.js';
import { createProviderHealthTracker, type ProviderHealthTracker } from '../../openrouter/openrouter-provider-health.js';
import { runGlmNarutoWorkerScheduler, type GlmNarutoWorkerJob } from './glm-naruto-worker-scheduler.js';

export interface WorkerPoolInput {
  readonly apiKey: string;
  readonly missionId: string;
  readonly cwd: string;
  readonly shards: readonly GlmNarutoShard[];
  readonly contextSummary: string;
  readonly maxWorkers: number;
  readonly workerTimeoutMs: number;
  readonly strategies: ReadonlyMap<string, readonly GlmNarutoPatchStrategy[]>;
  readonly isolationMode?: GlmNarutoIsolationMode;
  readonly cleanupWorktrees?: boolean;
  readonly baseCommit?: string | null;
  readonly health?: ProviderHealthTracker;
}

export interface WorkerPoolResult {
  readonly envelopes: readonly GlmNarutoPatchEnvelope[];
  readonly traces: readonly GlmNarutoWorkerTrace[];
  readonly failedShardIds: readonly string[];
  readonly concurrencyDecisions: readonly GlmNarutoConcurrencyDecision[];
  readonly schedulerSummary: {
    readonly max_observed_active_workers: number;
    readonly backpressure_events: number;
    readonly queue_drained: boolean;
  };
}

export async function runPatchWorkerPool(input: WorkerPoolInput): Promise<WorkerPoolResult> {
  const envelopes: GlmNarutoPatchEnvelope[] = [];
  const traces: GlmNarutoWorkerTrace[] = [];
  const failedShardIds: string[] = [];
  const concurrencyDecisions: GlmNarutoConcurrencyDecision[] = [];

  const mutableShards = input.shards.filter((s) => s.mutable);
  const decision = decideConcurrency({
    requestedClones: input.maxWorkers,
    activeWorkers: Math.min(input.maxWorkers, mutableShards.length),
    rateLimited429: 0,
    ttftP90Ms: 0,
    failureRate: 0,
    operatorMax: input.maxWorkers
  });

  const jobs: GlmNarutoWorkerJob[] = [];
  let workerIdx = 0;

  for (const shard of mutableShards) {
    const strategies = input.strategies.get(shard.id) || [shard.strategy];
    for (const strategy of strategies) {
      const workerId = `worker-${shard.id}-${strategy}-${workerIdx++}`;
      const shardWithStrategy: GlmNarutoShard = { ...shard, strategy };
      jobs.push({ worker_id: workerId, shard: shardWithStrategy, strategy });
    }
  }

  const health = input.health ?? createProviderHealthTracker();
  const schedulerResult = await runGlmNarutoWorkerScheduler({
    jobs,
    initial_active_workers: decision.target_active_workers,
    max_active_workers: input.maxWorkers,
    worker_timeout_ms: input.workerTimeoutMs,
    health,
    onDecision: (nextDecision) => {
      concurrencyDecisions.push(nextDecision);
    },
    runJob: (job) => runPatchWorker({
      apiKey: input.apiKey,
      missionId: input.missionId,
      workerId: job.worker_id,
      root: input.cwd,
      shard: job.shard,
      contextSummary: input.contextSummary,
      timeoutMs: input.workerTimeoutMs
    })
  });
  await writeSchedulerArtifacts(input.cwd, input.missionId, schedulerResult).catch(() => undefined);
  const results = schedulerResult.results;

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.ok && result.value.envelope) {
      const isolationMode = input.isolationMode ?? 'patch-envelope-only';
      let candidateEnvelope = result.value.envelope;
      let worktreeRecord: Record<string, unknown> | undefined;
      if (isolationMode === 'git-worktree') {
        const worktree = await materializePatchViaWorktree({
          repoRoot: input.cwd,
          missionId: input.missionId,
          envelope: candidateEnvelope,
          ...(input.baseCommit !== undefined ? { baseCommit: input.baseCommit } : {}),
          cleanup: input.cleanupWorktrees !== false
        });
        candidateEnvelope = worktree.envelope;
        worktreeRecord = {
          schema: 'sks.glm-naruto-worker-worktree.v1',
          selected: 'git-worktree',
          ok: worktree.ok,
          worktree_path: worktree.lease?.path ?? null,
          branch: worktree.lease?.branch ?? null,
          base_commit: worktree.lease?.base_commit ?? input.baseCommit ?? null,
          candidate_body_sha256: worktree.worktree?.candidate_body_sha256 ?? null,
          extracted_patch_sha256: worktree.worktree?.extracted_patch_sha256 ?? null,
          applied_patch_was_extracted: worktree.worktree?.applied_patch_was_extracted ?? false,
          blockers: worktree.blockers
        };
        if (!worktree.ok) {
          await writeGlmNarutoWorkerArtifacts({
            root: input.cwd,
            missionId: input.missionId,
            workerId: candidateEnvelope.worker_id,
            shardId: candidateEnvelope.shard_id,
            patchEnvelope: candidateEnvelope,
            streamTrace: result.value.trace,
            isolation: {
              schema: 'sks.glm-naruto-worker-isolation.v1',
              selected: isolationMode,
              workers_write_main_workspace: false
            },
            worktree: worktreeRecord,
            termination: { status: candidateEnvelope.status, ok: false, blockers: candidateEnvelope.blockers }
          }).catch(() => undefined);
          envelopes.push(candidateEnvelope);
          traces.push(result.value.trace);
          failedShardIds.push(candidateEnvelope.shard_id);
          continue;
        }
      }
      const gate = await evaluateGlmNarutoPatchCandidateGate({
        cwd: input.cwd,
        envelope: candidateEnvelope,
        apply: false
      });
      let envelope = candidateEnvelope;
      if (gate.ok) {
        envelope = createPatchEnvelope({
          missionId: envelope.mission_id,
          workerId: envelope.worker_id,
          shardId: envelope.shard_id,
          baseDigest: envelope.base_digest,
          patch: gate.extracted_patch,
          strategy: envelope.strategy,
          reasoningEffort: envelope.reasoning_effort,
          status: 'gate_passed',
          warnings: envelope.warnings
        });
      } else {
        envelope = {
          ...envelope,
          status: 'gate_failed',
          blockers: gate.blockers
        };
      }
      await writeGlmNarutoWorkerArtifacts({
        root: input.cwd,
        missionId: input.missionId,
        workerId: envelope.worker_id,
        shardId: envelope.shard_id,
        patchEnvelope: envelope,
        gateResult: gate,
        streamTrace: result.value.trace,
        isolation: {
          schema: 'sks.glm-naruto-worker-isolation.v1',
          selected: isolationMode,
          workers_write_main_workspace: false
        },
        ...(worktreeRecord ? { worktree: worktreeRecord } : {}),
        termination: { status: envelope.status, ok: gate.ok, blockers: envelope.blockers }
      }).catch(() => undefined);
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

  return {
    envelopes,
    traces,
    failedShardIds,
    concurrencyDecisions,
    schedulerSummary: {
      max_observed_active_workers: schedulerResult.max_observed_active_workers,
      backpressure_events: schedulerResult.backpressure_events,
      queue_drained: true
    }
  };
}

async function writeSchedulerArtifacts(root: string, missionId: string, schedulerResult: Awaited<ReturnType<typeof runGlmNarutoWorkerScheduler>>): Promise<void> {
  const dir = path.join(root, '.sneakoscope', 'glm-naruto', missionId);
  await writeTextAtomic(
    path.join(dir, 'scheduler-decisions.jsonl'),
    schedulerResult.decisions.map((decision) => JSON.stringify(decision)).join('\n') + (schedulerResult.decisions.length ? '\n' : '')
  );
  await writeJsonAtomic(path.join(dir, 'scheduler-summary.json'), {
    schema: 'sks.glm-naruto-scheduler-summary.v1',
    max_observed_active_workers: schedulerResult.max_observed_active_workers,
    backpressure_events: schedulerResult.backpressure_events,
    queue_drained: true,
    result_count: schedulerResult.results.length,
    decision_count: schedulerResult.decisions.length,
    retry_count: schedulerResult.retry_events.length
  });
  if (schedulerResult.backpressure_records.length > 0) {
    await writeTextAtomic(
      path.join(dir, 'provider-backpressure.jsonl'),
      schedulerResult.backpressure_records.map((row) => JSON.stringify(row)).join('\n') + '\n'
    );
  }
  if (schedulerResult.retry_events.length > 0) {
    await writeTextAtomic(
      path.join(dir, 'worker-retries.jsonl'),
      schedulerResult.retry_events.map((row) => JSON.stringify(row)).join('\n') + '\n'
    );
  }
}
