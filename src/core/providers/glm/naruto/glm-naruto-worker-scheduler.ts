import type { ProviderHealthTracker } from '../../openrouter/openrouter-provider-health.js';
import { nowIso } from '../../../fsx.js';
import { decideConcurrency } from './glm-naruto-concurrency-governor.js';
import type {
  GlmNarutoConcurrencyDecision,
  GlmNarutoPatchStrategy,
  GlmNarutoShard,
  GlmNarutoWorkerIssue
} from './glm-naruto-types.js';
import type { WorkerRunResult } from './glm-naruto-worker-runtime.js';

export interface GlmNarutoWorkerJob {
  readonly worker_id: string;
  readonly shard: GlmNarutoShard;
  readonly strategy: GlmNarutoPatchStrategy;
}

export interface GlmNarutoSchedulerInput {
  readonly jobs: readonly GlmNarutoWorkerJob[];
  readonly initial_active_workers: number;
  readonly max_active_workers: number;
  readonly worker_timeout_ms: number;
  readonly runJob: (job: GlmNarutoWorkerJob) => Promise<WorkerRunResult>;
  readonly onDecision: (decision: GlmNarutoConcurrencyDecision) => Promise<void> | void;
  readonly health: ProviderHealthTracker;
}

export interface GlmNarutoSchedulerResult {
  readonly results: readonly PromiseSettledResult<WorkerRunResult>[];
  readonly decisions: readonly GlmNarutoConcurrencyDecision[];
  readonly max_observed_active_workers: number;
  readonly backpressure_events: number;
  readonly retry_events: readonly Record<string, unknown>[];
  readonly backpressure_records: readonly Record<string, unknown>[];
}

interface QueueEntry {
  readonly job: GlmNarutoWorkerJob;
  readonly attempt: number;
}

interface RunningEntry {
  readonly key: number;
  readonly entry: QueueEntry;
  readonly settled: PromiseSettledResult<WorkerRunResult>;
}

export async function runGlmNarutoWorkerScheduler(input: GlmNarutoSchedulerInput): Promise<GlmNarutoSchedulerResult> {
  const queue: QueueEntry[] = input.jobs.map((job) => ({ job, attempt: 0 }));
  const running = new Map<number, Promise<RunningEntry>>();
  const results: PromiseSettledResult<WorkerRunResult>[] = [];
  const decisions: GlmNarutoConcurrencyDecision[] = [];
  const retryEvents: Record<string, unknown>[] = [];
  const backpressureRecords: Record<string, unknown>[] = [];
  const maxActive = Math.max(1, input.max_active_workers);
  let targetActive = Math.max(1, Math.min(maxActive, input.initial_active_workers || 1));
  let nextRunKey = 0;
  let maxObservedActive = 0;
  let backpressureEvents = 0;
  let failureCount = 0;
  let finishedCount = 0;
  let pauseUntilMs = 0;

  await recordDecision('initial');

  while (queue.length > 0 || running.size > 0) {
    const now = Date.now();
    if (pauseUntilMs > now && running.size === 0) {
      await sleep(Math.min(1_000, pauseUntilMs - now));
      continue;
    }

    while (queue.length > 0 && running.size < targetActive && Date.now() >= pauseUntilMs) {
      const entry = queue.shift()!;
      const key = nextRunKey++;
      running.set(key, runTimedJob(key, entry, input));
      maxObservedActive = Math.max(maxObservedActive, running.size);
    }

    if (running.size === 0) {
      if (queue.length > 0) {
        targetActive = Math.max(1, targetActive);
        pauseUntilMs = Math.min(pauseUntilMs || Date.now(), Date.now());
      }
      continue;
    }

    const completed = await Promise.race([...running.values()]);
    running.delete(completed.key);
    finishedCount++;

    const issue = issueFromSettled(completed.settled);
    if (completed.settled.status === 'rejected' || (completed.settled.status === 'fulfilled' && !completed.settled.value.ok)) {
      failureCount++;
    }

    updateProviderHealth(input.health, completed.settled);

    if (issue && shouldBackoff(issue)) {
      backpressureEvents++;
      const pauseMs = backoffMs(issue);
      pauseUntilMs = Math.max(pauseUntilMs, Date.now() + pauseMs);
      backpressureRecords.push({
        schema: 'sks.glm-naruto-provider-backpressure.v1',
        created_at: nowIso(),
        worker_id: completed.entry.job.worker_id,
        attempt: completed.entry.attempt,
        code: issue.code,
        provider_status: issue.provider_status ?? null,
        retry_after_ms: issue.retry_after_ms ?? null,
        pause_ms: pauseMs
      });
    }

    if (shouldRetry(completed.entry, completed.settled, issue)) {
      const retryEntry = { job: completed.entry.job, attempt: completed.entry.attempt + 1 };
      retryEvents.push({
        schema: 'sks.glm-naruto-worker-retry.v1',
        created_at: nowIso(),
        worker_id: completed.entry.job.worker_id,
        shard_id: completed.entry.job.shard.id,
        next_attempt: retryEntry.attempt,
        code: issue?.code ?? 'worker_scheduler_rejected'
      });
      queue.push(retryEntry);
    } else {
      results.push(completed.settled);
    }

    await recordDecision(issue?.code ?? 'worker_finished');
  }

  return {
    results,
    decisions,
    max_observed_active_workers: maxObservedActive,
    backpressure_events: backpressureEvents,
    retry_events: retryEvents,
    backpressure_records: backpressureRecords
  };

  async function recordDecision(reasonSuffix: string): Promise<void> {
    const health = input.health.getHealth();
    const decision = decideConcurrency({
      requestedWorkers: maxActive,
      activeWorkers: targetActive,
      rateLimited429: health?.count_429 ?? 0,
      ttftP90Ms: health?.p90_ttft_ms ?? 0,
      failureRate: finishedCount ? failureCount / finishedCount : 0,
      operatorMax: maxActive
    });
    targetActive = Math.max(running.size > 0 ? 1 : 0, Math.min(maxActive, decision.target_active_workers));
    if (targetActive === 0 && queue.length > 0 && running.size === 0) targetActive = 1;
    const recorded = { ...decision, reason: `${decision.reason}:${reasonSuffix}` };
    decisions.push(recorded);
    if (recorded.backpressure) backpressureEvents++;
    await input.onDecision(recorded);
  }
}

async function runTimedJob(key: number, entry: QueueEntry, input: GlmNarutoSchedulerInput): Promise<RunningEntry> {
  try {
    const value = await withTimeout(input.runJob(entry.job), input.worker_timeout_ms);
    return { key, entry, settled: { status: 'fulfilled', value } };
  } catch (reason) {
    return { key, entry, settled: { status: 'rejected', reason } };
  }
}

function updateProviderHealth(health: ProviderHealthTracker, settled: PromiseSettledResult<WorkerRunResult>): void {
  if (settled.status !== 'fulfilled') {
    health.record({ provider_slug: 'openrouter', model: 'z-ai/glm-5.2', count_5xx: 1, last_failure: nowIso() });
    return;
  }
  const issue = settled.value.issue;
  const trace = settled.value.trace;
  health.record({
    provider_slug: trace.provider_slug || 'openrouter',
    model: trace.model,
    ...(trace.ttft_ms !== null ? { p50_ttft_ms: trace.ttft_ms } : {}),
    ...(issue?.provider_status === 429 || issue?.code === 'glm_openrouter_rate_limited' ? { count_429: 1 } : {}),
    ...(typeof issue?.provider_status === 'number' && issue.provider_status >= 500 ? { count_5xx: 1 } : {}),
    last_success: settled.value.ok ? nowIso() : null,
    last_failure: settled.value.ok ? null : nowIso()
  });
}

function issueFromSettled(settled: PromiseSettledResult<WorkerRunResult>): GlmNarutoWorkerIssue | null {
  if (settled.status === 'rejected') {
    return { code: 'worker_scheduler_rejected', retryable: true, retry_after_ms: null };
  }
  return settled.value.issue ?? null;
}

function shouldRetry(entry: QueueEntry, settled: PromiseSettledResult<WorkerRunResult>, issue: GlmNarutoWorkerIssue | null): boolean {
  if (entry.attempt >= 1) return false;
  if (settled.status === 'rejected') return true;
  return settled.value.ok === false && issue?.retryable === true;
}

function shouldBackoff(issue: GlmNarutoWorkerIssue): boolean {
  return issue.provider_status === 429
    || issue.code === 'glm_openrouter_rate_limited'
    || (typeof issue.provider_status === 'number' && issue.provider_status >= 500)
    || issue.code === 'glm_openrouter_provider_unavailable'
    || issue.code === 'glm_stream_idle_timeout'
    || issue.code === 'glm_request_timeout';
}

function backoffMs(issue: GlmNarutoWorkerIssue): number {
  if (typeof issue.retry_after_ms === 'number' && Number.isFinite(issue.retry_after_ms) && issue.retry_after_ms > 0) {
    return Math.min(30_000, issue.retry_after_ms);
  }
  if (issue.provider_status === 429 || issue.code === 'glm_openrouter_rate_limited') return 1_000;
  return 250;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('worker_scheduler_timeout')), timeoutMs);
    })
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
