import path from 'node:path';
import { ensureDir, nowIso, writeJsonAtomic } from '../../../fsx.js';
import type { GlmNarutoPatchEnvelope, GlmNarutoWorkerTrace } from './glm-naruto-types.js';
import type { GlmNarutoPatchCandidateGateResult } from './glm-naruto-patch-candidate-gate.js';

export interface GlmNarutoWorkerArtifactInput {
  readonly root: string;
  readonly missionId: string;
  readonly workerId: string;
  readonly shardId: string;
  readonly requestSummary?: Record<string, unknown>;
  readonly streamTrace?: GlmNarutoWorkerTrace;
  readonly patchEnvelope?: GlmNarutoPatchEnvelope;
  readonly gateResult?: GlmNarutoPatchCandidateGateResult | Record<string, unknown>;
  readonly isolation?: Record<string, unknown>;
  readonly worktree?: Record<string, unknown>;
  readonly cleanup?: Record<string, unknown>;
  readonly termination?: Record<string, unknown>;
}

export async function writeGlmNarutoWorkerArtifacts(input: GlmNarutoWorkerArtifactInput): Promise<string> {
  const dir = path.join(input.root, '.sneakoscope', 'glm-naruto', input.missionId, 'workers', input.workerId);
  await ensureDir(dir);
  if (input.requestSummary) {
    await writeJsonAtomic(path.join(dir, 'request-summary.json'), sanitizeArtifact({
      schema: 'sks.glm-naruto-worker-request-summary.v1',
      worker_id: input.workerId,
      shard_id: input.shardId,
      created_at: nowIso(),
      ...input.requestSummary
    }));
  }
  if (input.streamTrace) await writeJsonAtomic(path.join(dir, 'stream-trace.json'), sanitizeArtifact(input.streamTrace));
  if (input.patchEnvelope) await writeJsonAtomic(path.join(dir, 'patch-envelope.json'), sanitizeArtifact(input.patchEnvelope));
  if (input.gateResult) await writeJsonAtomic(path.join(dir, 'gate-result.json'), sanitizeArtifact(input.gateResult));
  if (input.isolation) await writeJsonAtomic(path.join(dir, 'isolation.json'), sanitizeArtifact(input.isolation));
  if (input.worktree) await writeJsonAtomic(path.join(dir, 'worktree.json'), sanitizeArtifact(input.worktree));
  if (input.cleanup) await writeJsonAtomic(path.join(dir, 'cleanup.json'), sanitizeArtifact(input.cleanup));
  if (input.termination) {
    await writeJsonAtomic(path.join(dir, 'termination.json'), sanitizeArtifact({
      schema: 'sks.glm-naruto-worker-termination.v1',
      worker_id: input.workerId,
      shard_id: input.shardId,
      created_at: nowIso(),
      ...input.termination
    }));
  }
  return dir;
}

function sanitizeArtifact<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, raw) => {
    if (isSecretLikeKey(_key) && typeof raw === 'string' && raw.trim() && !isAllowedRedaction(raw)) return '[REDACTED]';
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
