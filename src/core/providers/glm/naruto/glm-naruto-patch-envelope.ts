import crypto from 'node:crypto';
import { nowIso } from '../../../fsx.js';
import { GLM_52_OPENROUTER_MODEL } from '../glm-52-settings.js';
import { parseUnifiedDiffPatch } from '../glm-patch-parser.js';
import type { GlmNarutoPatchEnvelope, GlmNarutoPatchStrategy, GlmNarutoReasoningEffort } from './glm-naruto-types.js';

export function createPatchEnvelope(input: {
  readonly missionId: string;
  readonly workerId: string;
  readonly shardId: string;
  readonly baseDigest: string;
  readonly patch: string;
  readonly strategy: GlmNarutoPatchStrategy;
  readonly reasoningEffort: GlmNarutoReasoningEffort | null;
  readonly status?: GlmNarutoPatchEnvelope['status'];
  readonly blockers?: readonly string[];
  readonly warnings?: readonly string[];
}): GlmNarutoPatchEnvelope {
  const parsed = parseUnifiedDiffPatch(input.patch);
  return {
    schema: 'sks.glm-naruto-patch-envelope.v1',
    mission_id: input.missionId,
    worker_id: input.workerId,
    shard_id: input.shardId,
    base_digest: input.baseDigest,
    target_paths: parsed.touchedPaths,
    patch: input.patch,
    patch_sha256: crypto.createHash('sha256').update(input.patch).digest('hex'),
    model: GLM_52_OPENROUTER_MODEL,
    provider: 'openrouter',
    reasoning_effort: input.reasoningEffort,
    gpt_fallback_allowed: false,
    generated_at: nowIso(),
    status: input.status || 'candidate',
    blockers: input.blockers || [],
    warnings: input.warnings || [],
    strategy: input.strategy
  };
}

export function normalizePatchForDigest(patch: string): string {
  return patch.replace(/\s+/g, ' ').trim();
}

export function digestPatch(patch: string): string {
  return crypto.createHash('sha256').update(normalizePatchForDigest(patch)).digest('hex');
}

export function parsePatchCandidateOutput(text: string): {
  readonly kind: 'patch' | 'need_context' | 'blocked' | 'malformed';
  readonly content: string;
  readonly paths?: readonly string[];
  readonly reason?: string;
} {
  const patchStart = text.indexOf('<sks_patch_candidate>');
  const patchEnd = text.indexOf('</sks_patch_candidate>');
  if (patchStart >= 0 && patchEnd > patchStart) {
    return { kind: 'patch', content: text.slice(patchStart + '<sks_patch_candidate>'.length, patchEnd).trim() };
  }

  const needStart = text.indexOf('<sks_need_context>');
  const needEnd = text.indexOf('</sks_need_context>');
  if (needStart >= 0 && needEnd > needStart) {
    const body = text.slice(needStart + '<sks_need_context>'.length, needEnd).trim();
    const paths = body.split(/\r?\n/).map((line) => line.match(/^\s*-\s*(.+?)\s*$/)?.[1]).filter((v): v is string => Boolean(v));
    return { kind: 'need_context', content: body, paths };
  }

  const blockedStart = text.indexOf('<sks_blocked>');
  const blockedEnd = text.indexOf('</sks_blocked>');
  if (blockedStart >= 0 && blockedEnd > blockedStart) {
    const body = text.slice(blockedStart + '<sks_blocked>'.length, blockedEnd).trim();
    const reason = body.match(/reason:\s*(.+)/i)?.[1]?.trim() || body;
    return { kind: 'blocked', content: body, reason };
  }

  return { kind: 'malformed', content: text.trim(), reason: 'missing_glm_naruto_output_envelope' };
}
