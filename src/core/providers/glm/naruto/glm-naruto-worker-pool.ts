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
import {
  runGlmNarutoStageScheduler,
  type GlmNarutoStageEvent,
  type GlmNarutoStageName
} from './glm-naruto-stage-scheduler.js';
import {
  createStageParallelismMetric,
  metricFromStageResult,
  type GlmNarutoStageParallelismMetric
} from './glm-naruto-parallelism-summary.js';

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
  readonly stageName?: GlmNarutoStageName;
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
  readonly stageMetrics: readonly GlmNarutoStageParallelismMetric[];
  readonly stageEvents: readonly GlmNarutoStageEvent[];
}

interface SuccessfulCandidate {
  readonly envelope: GlmNarutoPatchEnvelope;
  readonly trace: GlmNarutoWorkerTrace;
}

interface MaterializedCandidate {
  readonly envelope: GlmNarutoPatchEnvelope;
  readonly trace: GlmNarutoWorkerTrace;
  readonly gateEligible: boolean;
  readonly worktreeRecord?: Record<string, unknown>;
}

export async function runPatchWorkerPool(input: WorkerPoolInput): Promise<WorkerPoolResult> {
  const envelopes: GlmNarutoPatchEnvelope[] = [];
  const traces: GlmNarutoWorkerTrace[] = [];
  const failedShardIds: string[] = [];
  const concurrencyDecisions: GlmNarutoConcurrencyDecision[] = [];
  const stageMetrics: GlmNarutoStageParallelismMetric[] = [];
  const stageEvents: GlmNarutoStageEvent[] = [];

  const mutableShards = input.shards.filter((s) => s.mutable);
  const decision = decideConcurrency({
    requestedWorkers: input.maxWorkers,
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
  const patchGenerationStarted = Date.now();
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
  const patchGenerationWallClockMs = Date.now() - patchGenerationStarted;
  await writeSchedulerArtifacts(input.cwd, input.missionId, schedulerResult).catch(() => undefined);
  const results = schedulerResult.results;
  stageMetrics.push(createStageParallelismMetric({
    stage: input.stageName ?? 'patch_generation',
    job_count: jobs.length,
    max_observed_active: schedulerResult.max_observed_active_workers,
    wall_clock_ms: patchGenerationWallClockMs,
    sum_job_duration_ms: schedulerResult.results.reduce((sum, result) => (
      result.status === 'fulfilled' ? sum + Math.max(0, result.value.trace.total_ms) : sum + input.workerTimeoutMs
    ), 0),
    overlap_ratio: 1
  }));

  const successfulCandidates: SuccessfulCandidate[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.ok && result.value.envelope) {
      successfulCandidates.push({ envelope: result.value.envelope, trace: result.value.trace });
    } else if (result.status === 'fulfilled') {
      traces.push(result.value.trace);
      failedShardIds.push(result.value.trace.shard_id);
    } else {
      // rejected promise
      failedShardIds.push('unknown');
    }
  }

  const isolationMode = input.isolationMode ?? 'patch-envelope-only';
  let materializedCandidates: MaterializedCandidate[] = successfulCandidates.map((candidate) => ({
    envelope: candidate.envelope,
    trace: candidate.trace,
    gateEligible: true
  }));

  if (isolationMode === 'git-worktree' && materializedCandidates.length > 0) {
    const worktreeStage = await runGlmNarutoStageScheduler({
      stage: 'worktree_materialization',
      jobs: materializedCandidates.map((candidate) => ({
        id: candidate.envelope.worker_id,
        stage: 'worktree_materialization' as const,
        input: candidate
      })),
      max_active: Math.min(4, materializedCandidates.length),
      timeout_ms: input.workerTimeoutMs,
      runJob: async (job) => {
        const worktree = await materializePatchViaWorktree({
          repoRoot: input.cwd,
          missionId: input.missionId,
          envelope: job.input.envelope,
          ...(input.baseCommit !== undefined ? { baseCommit: input.baseCommit } : {}),
          cleanup: input.cleanupWorktrees !== false
        });
        const worktreeRecord = {
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
        return {
          envelope: worktree.ok ? worktree.envelope : { ...worktree.envelope, status: 'gate_failed' as const, blockers: worktree.blockers },
          worktreeRecord,
          ok: worktree.ok
        };
      }
    });
    stageMetrics.push(metricFromStageResult(worktreeStage));
    stageEvents.push(...worktreeStage.events);
    materializedCandidates = materializedCandidates.map((candidate, index) => {
      const result = worktreeStage.results[index];
      if (result?.status === 'fulfilled') {
        return {
          envelope: result.value.envelope,
          trace: candidate.trace,
          gateEligible: result.value.ok,
          worktreeRecord: result.value.worktreeRecord
        };
      }
      return {
        envelope: { ...candidate.envelope, status: 'gate_failed' as const, blockers: ['worktree_materialization_failed'] },
        trace: candidate.trace,
        gateEligible: false
      };
    });
  }

  for (const candidate of materializedCandidates.filter((item) => !item.gateEligible)) {
    await writeGlmNarutoWorkerArtifacts({
      root: input.cwd,
      missionId: input.missionId,
      workerId: candidate.envelope.worker_id,
      shardId: candidate.envelope.shard_id,
      patchEnvelope: candidate.envelope,
      streamTrace: candidate.trace,
      isolation: {
        schema: 'sks.glm-naruto-worker-isolation.v1',
        selected: isolationMode,
        workers_write_main_workspace: false
      },
      ...(candidate.worktreeRecord ? { worktree: candidate.worktreeRecord } : {}),
      termination: { status: candidate.envelope.status, ok: false, blockers: candidate.envelope.blockers }
    }).catch(() => undefined);
    envelopes.push(candidate.envelope);
    traces.push(candidate.trace);
    failedShardIds.push(candidate.envelope.shard_id);
  }

  const gateCandidates = materializedCandidates.filter((item) => item.gateEligible);
  if (gateCandidates.length > 0) {
    const gateStage = await runGlmNarutoStageScheduler({
      stage: 'candidate_gate',
      jobs: gateCandidates.map((candidate) => ({
        id: candidate.envelope.worker_id,
        stage: 'candidate_gate' as const,
        input: candidate
      })),
      max_active: Math.min(8, gateCandidates.length),
      timeout_ms: Math.min(60_000, input.workerTimeoutMs),
      runJob: (job) => evaluateGlmNarutoPatchCandidateGate({
        cwd: input.cwd,
        envelope: job.input.envelope,
        apply: false
      })
    });
    stageMetrics.push(metricFromStageResult(gateStage));
    stageEvents.push(...gateStage.events);

    for (let index = 0; index < gateCandidates.length; index += 1) {
      const candidate = gateCandidates[index]!;
      const result = gateStage.results[index];
      const gate = result?.status === 'fulfilled'
        ? result.value
        : {
            schema: 'sks.glm-naruto-patch-candidate-gate.v1' as const,
            ok: false,
            worker_id: candidate.envelope.worker_id,
            shard_id: candidate.envelope.shard_id,
            patch_id: candidate.envelope.patch_sha256,
            extracted_patch: '',
            touched_paths: [],
            checks: [],
            blockers: ['candidate_gate_failed']
          };
      let envelope = candidate.envelope;
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
        streamTrace: candidate.trace,
        isolation: {
          schema: 'sks.glm-naruto-worker-isolation.v1',
          selected: isolationMode,
          workers_write_main_workspace: false
        },
        ...(candidate.worktreeRecord ? { worktree: candidate.worktreeRecord } : {}),
        termination: { status: envelope.status, ok: gate.ok, blockers: envelope.blockers }
      }).catch(() => undefined);
      envelopes.push(envelope);
      traces.push(candidate.trace);
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
    },
    stageMetrics,
    stageEvents
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
