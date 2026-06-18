import path from 'node:path';
import { ensureDir, nowIso, writeJsonAtomic } from '../../../fsx.js';
import type { GlmNarutoPatchEnvelope } from './glm-naruto-types.js';
import type { GlmNarutoWorkerTrace, GlmNarutoMissionResult } from './glm-naruto-types.js';

export interface MissionTraceState {
  readonly missionId: string;
  readonly startedMs: number;
  readonly workerTraces: GlmNarutoWorkerTrace[];
}

export function createMissionTrace(missionId: string): MissionTraceState {
  return {
    missionId,
    startedMs: Date.now(),
    workerTraces: []
  };
}

export function recordWorkerTrace(state: MissionTraceState, trace: GlmNarutoWorkerTrace): MissionTraceState {
  return { ...state, workerTraces: [...state.workerTraces, trace] };
}

export async function writeMissionArtifacts(input: {
  readonly root: string;
  readonly missionId: string;
  readonly workGraph?: unknown;
  readonly conflictGraph?: unknown;
  readonly mergePlan?: unknown;
  readonly judgeResult?: unknown;
  readonly workerTraces: readonly GlmNarutoWorkerTrace[];
  readonly providerHealth?: unknown;
  readonly termination?: unknown;
  readonly applyResult?: unknown;
  readonly verificationSummary?: unknown;
  readonly missionResult?: GlmNarutoMissionResult;
  readonly envelopes?: readonly GlmNarutoPatchEnvelope[];
}): Promise<string> {
  const dir = path.join(input.root, '.sneakoscope', 'glm-naruto', input.missionId);
  await ensureDir(dir);
  if (input.workGraph) await writeJsonAtomic(path.join(dir, 'work-graph.json'), input.workGraph);
  if (input.conflictGraph) await writeJsonAtomic(path.join(dir, 'conflict-graph.json'), input.conflictGraph);
  if (input.mergePlan) await writeJsonAtomic(path.join(dir, 'final-merge-plan.json'), input.mergePlan);
  if (input.judgeResult) await writeJsonAtomic(path.join(dir, 'judge-result.json'), input.judgeResult);
  if (input.workerTraces.length > 0) await writeJsonAtomic(path.join(dir, 'worker-traces.json'), input.workerTraces);
  if (input.providerHealth) await writeJsonAtomic(path.join(dir, 'provider-health.json'), input.providerHealth);
  if (input.termination) await writeJsonAtomic(path.join(dir, 'termination.json'), input.termination);
  if (input.applyResult) await writeJsonAtomic(path.join(dir, 'apply-result.json'), input.applyResult);
  if (input.verificationSummary) await writeJsonAtomic(path.join(dir, 'verification-summary.json'), input.verificationSummary);
  if (input.missionResult) await writeJsonAtomic(path.join(dir, 'mission-result.json'), input.missionResult);
  // 4.0.9: Write per-worker patch envelope / request-summary / stream-trace / gate-result artifacts.
  if (input.envelopes && input.envelopes.length > 0) {
    const workersDir = path.join(dir, 'workers');
    await ensureDir(workersDir);
    for (const env of input.envelopes) {
      const workerId = String(env.worker_id || env.shard_id || 'unknown');
      const workerDir = path.join(workersDir, workerId);
      await ensureDir(workerDir);
      await writeJsonAtomic(path.join(workerDir, 'patch-envelope.json'), env);
      await writeJsonAtomic(path.join(workerDir, 'request-summary.json'), {
        schema: 'sks.glm-naruto-worker-request-summary.v1',
        worker_id: workerId,
        shard_id: env.shard_id,
        model: env.model || null,
        provider: 'openrouter',
        request_body_size: env.request_body_size ?? null,
        cached: env.cached ?? false,
        created_at: nowIso(),
      });
      await writeJsonAtomic(path.join(workerDir, 'stream-trace.json'), {
        schema: 'sks.glm-naruto-worker-stream-trace.v1',
        worker_id: workerId,
        ttft_ms: env.ttft_ms ?? null,
        chunk_count: env.chunk_count ?? null,
        real_stream: env.real_stream ?? true,
        idle_timeout_ms: env.idle_timeout_ms ?? null,
        created_at: nowIso(),
      });
      await writeJsonAtomic(path.join(workerDir, 'gate-result.json'), {
        schema: 'sks.glm-naruto-worker-gate-result.v1',
        worker_id: workerId,
        shard_id: env.shard_id,
        status: env.status,
        gate_passed: env.status === 'gate_passed',
        verification_passed: env.verification_passed ?? (env.status === 'gate_passed'),
        created_at: nowIso(),
      });
    }
  }
  return dir;
}

export function buildMissionSummary(input: {
  readonly missionId: string;
  readonly startedMs: number;
  readonly workerTraces: readonly GlmNarutoWorkerTrace[];
  readonly patchCandidates: number;
  readonly gatePassed: number;
  readonly mergeable: number;
  readonly appliedPatches: number;
  readonly failedShards: number;
  readonly repairWaves: number;
}): {
  readonly wall_clock_ms: number;
  readonly workers_started: number;
  readonly workers_completed: number;
  readonly patch_candidates: number;
  readonly gate_passed_candidates: number;
  readonly mergeable_candidates: number;
  readonly applied_patches: number;
  readonly failed_shards: number;
  readonly repair_waves: number;
  readonly budget_used_ms: number;
} {
  return {
    wall_clock_ms: Date.now() - input.startedMs,
    workers_started: input.workerTraces.length,
    workers_completed: input.workerTraces.filter((t) => t.status === 'completed').length,
    patch_candidates: input.patchCandidates,
    gate_passed_candidates: input.gatePassed,
    mergeable_candidates: input.mergeable,
    applied_patches: input.appliedPatches,
    failed_shards: input.failedShards,
    repair_waves: input.repairWaves,
    budget_used_ms: Date.now() - input.startedMs
  };
}
