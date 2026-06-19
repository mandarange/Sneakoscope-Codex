export type GlmNarutoStageName =
  | 'patch_generation'
  | 'worktree_materialization'
  | 'candidate_gate'
  | 'verifier'
  | 'repair_generation'
  | 'merge_precheck';

export interface GlmNarutoStageJob<TInput> {
  readonly id: string;
  readonly stage: GlmNarutoStageName;
  readonly input: TInput;
}

export interface GlmNarutoStageEvent {
  readonly schema: 'sks.glm-naruto-stage-event.v1';
  readonly stage: GlmNarutoStageName;
  readonly job_id: string;
  readonly phase: 'start' | 'end';
  readonly active: number;
  readonly timestamp_ms: number;
  readonly duration_ms?: number;
  readonly status?: 'fulfilled' | 'rejected';
}

export interface GlmNarutoStageSchedulerInput<TInput, TResult> {
  readonly stage: GlmNarutoStageName;
  readonly jobs: readonly GlmNarutoStageJob<TInput>[];
  readonly max_active: number;
  readonly runJob: (job: GlmNarutoStageJob<TInput>) => Promise<TResult>;
  readonly timeout_ms: number;
  readonly onEvent?: (event: GlmNarutoStageEvent) => void | Promise<void>;
}

export interface GlmNarutoStageSchedulerResult<TResult> {
  readonly stage: GlmNarutoStageName;
  readonly results: readonly PromiseSettledResult<TResult>[];
  readonly max_observed_active: number;
  readonly wall_clock_ms: number;
  readonly sum_job_duration_ms: number;
  readonly overlap_ratio: number;
  readonly events: readonly GlmNarutoStageEvent[];
}

interface RunningStageJob<TInput, TResult> {
  readonly key: number;
  readonly index: number;
  readonly job: GlmNarutoStageJob<TInput>;
  readonly started_ms: number;
  readonly settled: PromiseSettledResult<TResult>;
}

export async function runGlmNarutoStageScheduler<TInput, TResult>(
  input: GlmNarutoStageSchedulerInput<TInput, TResult>
): Promise<GlmNarutoStageSchedulerResult<TResult>> {
  const started = Date.now();
  const queue = input.jobs.map((job, index) => ({ job, index }));
  const running = new Map<number, Promise<RunningStageJob<TInput, TResult>>>();
  const results = new Array<PromiseSettledResult<TResult> | undefined>(input.jobs.length);
  const events: GlmNarutoStageEvent[] = [];
  const maxActive = Math.max(1, Math.min(Math.max(1, input.max_active), Math.max(1, input.jobs.length)));
  let nextKey = 0;
  let maxObservedActive = 0;
  let sumJobDurationMs = 0;

  while (queue.length > 0 || running.size > 0) {
    while (queue.length > 0 && running.size < maxActive) {
      const next = queue.shift()!;
      const key = nextKey++;
      const active = running.size + 1;
      maxObservedActive = Math.max(maxObservedActive, active);
      await emit({
        schema: 'sks.glm-naruto-stage-event.v1',
        stage: input.stage,
        job_id: next.job.id,
        phase: 'start',
        active,
        timestamp_ms: Date.now()
      });
      running.set(key, runOne(key, next.index, next.job, input));
    }

    if (running.size === 0) continue;
    const completed = await Promise.race([...running.values()]);
    running.delete(completed.key);
    const duration = Math.max(0, Date.now() - completed.started_ms);
    sumJobDurationMs += duration;
    results[completed.index] = completed.settled;
    await emit({
      schema: 'sks.glm-naruto-stage-event.v1',
      stage: input.stage,
      job_id: completed.job.id,
      phase: 'end',
      active: running.size,
      timestamp_ms: Date.now(),
      duration_ms: duration,
      status: completed.settled.status
    });
  }

  const wallClockMs = Math.max(0, Date.now() - started);
  return {
    stage: input.stage,
    results: results.map((row) => row!),
    max_observed_active: maxObservedActive,
    wall_clock_ms: wallClockMs,
    sum_job_duration_ms: sumJobDurationMs,
    overlap_ratio: wallClockMs > 0 ? sumJobDurationMs / wallClockMs : input.jobs.length > 1 ? input.jobs.length : 1,
    events
  };

  async function emit(event: GlmNarutoStageEvent): Promise<void> {
    events.push(event);
    if (input.onEvent) await input.onEvent(event);
  }
}

async function runOne<TInput, TResult>(
  key: number,
  index: number,
  job: GlmNarutoStageJob<TInput>,
  input: GlmNarutoStageSchedulerInput<TInput, TResult>
): Promise<RunningStageJob<TInput, TResult>> {
  const startedMs = Date.now();
  try {
    const value = await withTimeout(input.runJob(job), input.timeout_ms);
    return { key, index, job, started_ms: startedMs, settled: { status: 'fulfilled', value } };
  } catch (reason) {
    return { key, index, job, started_ms: startedMs, settled: { status: 'rejected', reason } };
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('glm_stage_job_timeout')), timeoutMs);
    })
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
