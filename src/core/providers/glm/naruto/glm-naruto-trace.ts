import path from 'node:path';
import { ensureDir, nowIso, writeJsonAtomic, writeTextAtomic } from '../../../fsx.js';
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
  readonly concurrencyDecisions?: unknown;
  readonly isolationPolicy?: unknown;
  readonly candidateScoreboard?: unknown;
  readonly termination?: unknown;
  readonly applyResult?: unknown;
  readonly applyTransaction?: unknown;
  readonly verificationSummary?: unknown;
  readonly missionResult?: GlmNarutoMissionResult;
  readonly envelopes?: readonly GlmNarutoPatchEnvelope[];
}): Promise<string> {
  const dir = path.join(input.root, '.sneakoscope', 'glm-naruto', input.missionId);
  await ensureDir(dir);
  if (input.workGraph) await writeJsonAtomic(path.join(dir, 'work-graph.json'), sanitizeArtifact(input.workGraph));
  if (input.conflictGraph) await writeJsonAtomic(path.join(dir, 'conflict-graph.json'), sanitizeArtifact(input.conflictGraph));
  if (input.mergePlan) await writeJsonAtomic(path.join(dir, 'final-merge-plan.json'), sanitizeArtifact(input.mergePlan));
  if (input.judgeResult) await writeJsonAtomic(path.join(dir, 'judge-result.json'), sanitizeArtifact(input.judgeResult));
  if (input.workerTraces.length > 0) await writeJsonAtomic(path.join(dir, 'worker-traces.json'), sanitizeArtifact(input.workerTraces));
  if (input.providerHealth) await writeJsonAtomic(path.join(dir, 'provider-health.json'), sanitizeArtifact(input.providerHealth));
  if (input.concurrencyDecisions) {
    await writeJsonAtomic(path.join(dir, 'concurrency-decisions.json'), sanitizeArtifact(input.concurrencyDecisions));
    const rows = Array.isArray(input.concurrencyDecisions) ? input.concurrencyDecisions : [input.concurrencyDecisions];
    await writeTextAtomic(path.join(dir, 'concurrency-decisions.jsonl'), rows.map((row) => JSON.stringify(sanitizeArtifact(row))).join('\n') + '\n');
  }
  if (input.isolationPolicy) await writeJsonAtomic(path.join(dir, 'isolation-policy.json'), sanitizeArtifact(input.isolationPolicy));
  if (input.candidateScoreboard) await writeJsonAtomic(path.join(dir, 'candidate-scoreboard.json'), sanitizeArtifact(input.candidateScoreboard));
  if (input.termination) await writeJsonAtomic(path.join(dir, 'termination.json'), sanitizeArtifact(input.termination));
  if (input.applyResult) await writeJsonAtomic(path.join(dir, 'apply-result.json'), sanitizeArtifact(input.applyResult));
  if (input.applyTransaction) await writeJsonAtomic(path.join(dir, 'apply-transaction.json'), sanitizeArtifact(input.applyTransaction));
  if (input.verificationSummary) await writeJsonAtomic(path.join(dir, 'verification-summary.json'), sanitizeArtifact(input.verificationSummary));
  if (input.missionResult) await writeJsonAtomic(path.join(dir, 'mission-result.json'), sanitizeArtifact(input.missionResult));
  // 4.0.9: Write per-worker patch envelope / request-summary / stream-trace / gate-result artifacts.
  if (input.envelopes && input.envelopes.length > 0) {
    const workersDir = path.join(dir, 'workers');
    await ensureDir(workersDir);
    for (const env of input.envelopes) {
      const workerId = String(env.worker_id || env.shard_id || 'unknown');
      const workerDir = path.join(workersDir, workerId);
      await ensureDir(workerDir);
      await writeJsonAtomic(path.join(workerDir, 'patch-envelope.json'), sanitizeArtifact(env));
      await writeJsonAtomic(path.join(workerDir, 'request-summary.json'), sanitizeArtifact({
        schema: 'sks.glm-naruto-worker-request-summary.v1',
        worker_id: workerId,
        shard_id: env.shard_id,
        model: env.model || null,
        provider: 'openrouter',
        request_body_size: env.request_body_size ?? null,
        cached: env.cached ?? false,
        created_at: nowIso(),
      }));
      await writeJsonAtomic(path.join(workerDir, 'stream-trace.json'), sanitizeArtifact({
        schema: 'sks.glm-naruto-worker-stream-trace.v1',
        worker_id: workerId,
        ttft_ms: env.ttft_ms ?? null,
        chunk_count: env.chunk_count ?? null,
        real_stream: env.real_stream ?? true,
        idle_timeout_ms: env.idle_timeout_ms ?? null,
        created_at: nowIso(),
      }));
      await writeJsonAtomic(path.join(workerDir, 'gate-result.json'), sanitizeArtifact({
        schema: 'sks.glm-naruto-worker-gate-result.v1',
        worker_id: workerId,
        shard_id: env.shard_id,
        status: env.status,
        gate_passed: env.status === 'gate_passed',
        verification_passed: env.verification_passed ?? (env.status === 'gate_passed'),
        created_at: nowIso(),
      }));
    }
  }
  return dir;
}

function sanitizeArtifact<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, raw) => {
    if (isSecretLikeKey(key) && typeof raw === 'string' && raw.trim() && !isAllowedRedaction(raw)) return '[REDACTED]';
    if (typeof raw !== 'string') return raw;
    return raw
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/g, 'Bearer [REDACTED]')
      .replace(/sk-or-[A-Za-z0-9_-]+/g, 'sk-or-[REDACTED]')
      .replace(/sk-[A-Za-z0-9_-]{12,}/g, 'sk-[REDACTED]');
  })) as T;
}

function isSecretLikeKey(key: string): boolean {
  return /^(authorization|api_key|apiKey|access_token|token|secret|password|OPENROUTER_API_KEY|SKS_OPENROUTER_API_KEY)$/i.test(key);
}

function isAllowedRedaction(value: string): boolean {
  return ['[REDACTED]', '<redacted>', 'sk-or-[REDACTED]', 'Bearer [REDACTED]'].includes(value.trim());
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
