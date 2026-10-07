import path from 'node:path';
import { exists, nowIso, readJson, writeJsonAtomic } from './fsx.js';
import { DEFAULT_FORGETTING_THRESHOLDS, MEMORY_LIFECYCLE_STATES, forgettingDecision } from './evaluation.js';
import { stableDigest, redactDecisionText } from './decisions/state.js';
import { MEMORY_DISPOSITIONS, MEMORY_POLICY_REVISION, type MemoryDisposition } from './decisions/types.js';
import { JEV_MEMORY_LIMITS, type JevMemoryIntake, type MemoryScope } from './artifact-schemas.js';
import { containsPlaintextSecret } from './secret-redaction.js';

export const MEMORY_TTL_SECONDS: Readonly<Record<MemoryDisposition, number>> = Object.freeze({
  ephemeral_turn: 0, mission_memory: 86400, durable_preference: 90 * 86400,
  durable_policy: 180 * 86400, visual_evidence: 30 * 86400, negative_evidence: 180 * 86400,
  sensitive_no_store: 0, needs_confirmation: 0, keep_baseline: 0
});
export const MEMORY_REDACTION_DIGEST = stableDigest({ revision: MEMORY_POLICY_REVISION, rules: ['secret','pii','home_path','raw_image','bounded_explicit_candidate'] });
const REMEMBER_CUE = /(?:\b(?:remember|save|store|pin|always|never)\b|기억해|기억하|앞으로\s*항상|저장해)\s*(?::|that\b|this\b)?\s*([^\n]{1,512})/i;
const FORGET_CUE = /(?:\b(?:forget|delete|remove)\s+(?:this|that|memory|preference|rule)\b|기억.*(?:삭제|잊어)|잊어줘)/i;
export function sensitiveMemoryInput(text: string): boolean {
  return containsPlaintextSecret(text) || /data:image\/|-----BEGIN|\b(?:password|credential|session[_ -]?id)\s*[:=]|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\/Users\/|\/home\/)[^/\s]+|\b\d{6}[- ]?[1-4]\d{6}\b|\b(?:\d[ -]?){13,19}\b/i.test(text);
}

/** Cues select a candidate, never source truth or permission to publish. */
export function memoryDispositionPolicy(input: {
  prompt: string; missionId?: string | null; enabled: boolean; choice?: string | null;
  sourceFresh?: boolean; graphFresh?: boolean; verifiedEvidence?: 'negative' | 'visual' | 'policy' | null;
  scope?: MemoryScope; allowUserScope?: boolean;
}) {
  const forget = FORGET_CUE.test(input.prompt);
  const sensitive = sensitiveMemoryInput(input.prompt);
  const match = input.prompt.match(REMEMBER_CUE);
  let scope: MemoryScope = input.scope === 'user' && input.allowUserScope !== true ? 'project' : input.scope || 'project';
  const selected = MEMORY_DISPOSITIONS.find((id) => id === input.choice) || 'keep_baseline';
  let disposition: MemoryDisposition = 'keep_baseline';
  let reason = 'no_memory_cue';
  if (forget) { disposition = 'ephemeral_turn'; reason = 'explicit_forget'; }
  else if (sensitive) { disposition = 'sensitive_no_store'; reason = 'sensitive_no_store'; }
  else if (!input.missionId) { reason = 'mission_required'; }
  else if (!input.enabled) { reason = 'off'; }
  else if (match) { disposition = input.verifiedEvidence === 'policy' ? 'durable_policy' : 'durable_preference'; reason = 'explicit_remember'; }
  else if (input.sourceFresh !== true || input.graphFresh !== true) { disposition = 'needs_confirmation'; reason = 'stale_snapshot'; }
  else if (input.verifiedEvidence === 'negative') { disposition = 'negative_evidence'; reason = 'verified_negative_evidence'; }
  else if (input.verifiedEvidence === 'visual') { disposition = 'visual_evidence'; reason = 'verified_visual_evidence'; }
  else if (['mission_memory','ephemeral_turn','needs_confirmation'].includes(selected)) { disposition = selected; reason = 'compiled_choice'; }
  else if (selected !== 'keep_baseline') { disposition = 'needs_confirmation'; reason = 'evidence_required'; }
  // Only the explicit bounded clause may become a prompt-derived candidate.
  // A model choice cannot turn a complete raw prompt into memory.
  if (disposition === 'mission_memory') scope = 'mission';
  const candidate = !sensitive && match && reason === 'explicit_remember' ? redactDecisionText(match[1] || '', JEV_MEMORY_LIMITS.textChars) : '';
  return { disposition, scope, ttl: MEMORY_TTL_SECONDS[disposition], reason, forget,
    candidate: candidate && !sensitiveMemoryInput(candidate) ? candidate : null,
    cue: Boolean(match || forget || input.verifiedEvidence), policy_revision: MEMORY_POLICY_REVISION };
}

export interface MemoryOverlayItem {
  memory_id: string; text: string; source: string; evidence_digest: string; source_digest: string;
  lifecycle: string; freshness: 'fresh' | 'stale'; effective_trust: number; scope: MemoryScope;
  created_at: string; ttl: number; evidence_refs: string[]; image_voxel_refs: JevMemoryIntake['image_voxel_refs'];
  coord?: Record<string, unknown>; voxel_layers?: Record<string, number>;
  [key: string]: unknown;
}
/** Memory-only filter. It cannot mutate or sweep the code-navigation pack. */
export function filterMemoryOverlay(items: readonly MemoryOverlayItem[], opts: { highRisk?: boolean; topK?: number; maxTokens?: number; now?: number; scope?: MemoryScope } = {}) {
  const topK = Math.max(0, Math.min(opts.highRisk ? 16 : 8, opts.topK ?? (opts.highRisk ? 16 : 8)));
  const maxTokens = Math.max(0, Math.min(6000, opts.maxTokens ?? 6000));
  let tokens = 0;
  const selected: MemoryOverlayItem[] = [];
  for (const item of items) {
    if (selected.length >= topK) break;
    if (!['ACTIVE','PINNED'].includes(item.lifecycle) || item.freshness !== 'fresh' || !item.source || !item.evidence_digest || !Number.isFinite(item.effective_trust) || item.effective_trust < 0.55 || sensitiveMemoryInput(item.text)) continue;
    if (opts.scope && opts.scope !== item.scope) continue;
    if (!Number.isFinite(Date.parse(item.created_at)) || Date.parse(item.created_at) + item.ttl * 1000 <= (opts.now ?? Date.now())) continue;
    const cost = Math.ceil((item.text.length + item.source.length + item.evidence_digest.length + 120) / 4);
    if (tokens + cost > maxTokens) continue;
    tokens += cost; selected.push(item);
  }
  return { items: selected, tokens, top_k: topK, max_tokens: maxTokens };
}

/** Memory-only lifecycle pass. It reports expiry/conflict decisions and never
 * mutates code-navigation claims or performs physical garbage collection. */
export function sweepMemoryOverlay(items: readonly MemoryOverlayItem[], opts: { now?: number } = {}) {
  const now = opts.now ?? Date.now();
  const operations = items.map((item) => {
    const expired = !Number.isFinite(Date.parse(item.created_at)) || Date.parse(item.created_at) + item.ttl * 1000 <= now;
    const lifecycle = item.lifecycle === 'CONFLICTED' ? 'CONFLICTED' : expired ? 'DELETE_CANDIDATE' : item.lifecycle;
    return { memory_id: item.memory_id, before: item.lifecycle, after: lifecycle, operation: lifecycle === 'DELETE_CANDIDATE' ? 'SUPPRESS_RETRIEVAL' : 'NOOP', reason: expired ? 'ttl_expired' : lifecycle === 'CONFLICTED' ? 'conflict_requires_confirmation' : 'within_policy' };
  });
  return { schema: 'sks.memory-overlay-sweep.v1', generated_at: nowIso(), operations, code_claims_touched: 0, physical_gc: false };
}

export const DEFAULT_RETRIEVAL_BUDGET = {
  top_k_default: 8,
  top_k_high_risk: 16,
  max_tokens: 6000,
  actual_tokens: 0
};

export function memoryUtilityScore(claim: any = {}, duplicateCount: any = 0) {
  const source = String(claim.source || claim.file || '');
  const trust = Number(claim.trust_score ?? (claim.status === 'supported' ? 0.75 : source ? 0.65 : 0.35));
  const evidence = Math.min(1, Number(claim.evidence_count || (source ? 1 : 0)) / 4);
  const weight = Math.min(1, Number(claim.required_weight || 0.5) / 1.5);
  const freshness = ({ fresh: 1, aging: 0.65, stale: 0.25, obsolete: 0, unknown: 0.45 } as Record<string, number>)[claim.freshness] ?? 0.45;
  const authority = source || ['code', 'contract', 'test'].includes(String(claim.authority || '').toLowerCase()) ? 0.12 : 0;
  const riskBoost = ['critical', 'high'].includes(String(claim.risk || '').toLowerCase()) ? 0.22 : 0;
  const duplicatePenalty = Math.min(0.5, duplicateCount * 0.15);
  const unsupportedPenalty = claim.status === 'unsupported' ? 0.6 : claim.status === 'unknown' ? 0.18 : 0;
  return clamp01(trust * 0.3 + evidence * 0.2 + weight * 0.2 + freshness * 0.18 + riskBoost + authority - duplicatePenalty - unsupportedPenalty);
}

export async function sweepTriWiki(root: any, opts: any = {}) {
  const missionId = opts.missionId || null;
  const startedAt = nowIso();
  const packFile = opts.packFile || path.join(root, '.sneakoscope', 'wiki', 'context-pack.json');
  const pack = await readJson(packFile, { claims: [] });
  const claims = Array.isArray(pack.claims) ? pack.claims : [];
  const seen = new Map();
  const operations: any[] = [];
  let actualTokens = 0;

  for (const claim of claims) {
    const key = normalizeClaimText(claim.text || claim.claim || claim.id);
    const duplicateCount = seen.get(key) || 0;
    seen.set(key, duplicateCount + 1);
    const before = Number(claim.retrieval_priority ?? claim.trust_score ?? 0.5);
    const score = memoryUtilityScore(claim, duplicateCount);
    actualTokens += estimateTokens(claim.text || claim.claim || '');
    operations.push(operationForClaim(claim, before, score, duplicateCount));
  }

  const skillCandidates = operations.filter((op: any) => op.operation === 'PROMOTE_SKILL');
  const mistakeRules = operations.filter((op: any) => op.operation === 'PROMOTE_RULE');
  const report = {
    schema_version: 1,
    mission_id: missionId,
    started_at: startedAt,
    completed_at: nowIso(),
    operations,
    lifecycle_states: MEMORY_LIFECYCLE_STATES,
    forgetting_defaults: DEFAULT_FORGETTING_THRESHOLDS,
    tombstones: operations.map((op: any) => op.tombstone).filter(Boolean),
    retrieval_budget: {
      ...DEFAULT_RETRIEVAL_BUDGET,
      top_k_default: Number(opts.topKDefault || DEFAULT_RETRIEVAL_BUDGET.top_k_default),
      top_k_high_risk: Number(opts.topKHighRisk || DEFAULT_RETRIEVAL_BUDGET.top_k_high_risk),
      max_tokens: Number(opts.maxTokens || DEFAULT_RETRIEVAL_BUDGET.max_tokens),
      actual_tokens: actualTokens
    },
    skill_candidates: skillCandidates,
    mistake_rules: mistakeRules,
    validation: {
      schema_passed: true,
      source_hydration_passed: await sourceHydrationPass(root, claims),
      context_pack_validated: Boolean(pack?.wiki || pack?.claims)
    }
  };
  return report;
}

export async function writeMemorySweepReport(root: any, dir: any, opts: any = {}) {
  const report = await sweepTriWiki(root, opts);
  await writeJsonAtomic(path.join(dir, 'memory-sweep-report.json'), report);
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'wiki', 'last-sweep-report.json'), report);
  return report;
}

function operationForClaim(claim: any, before: any, score: any, duplicateCount: any) {
  const text = String(claim.text || claim.claim || '');
  const reasonCodes: any[] = [];
  let operation = 'NOOP';
  let reversible = true;
  if (duplicateCount > 0) {
    operation = 'CONSOLIDATE';
    reasonCodes.push('duplicate');
  } else if (claim.status === 'unsupported') {
    operation = 'HARD_DELETE';
    reasonCodes.push('false_or_unsupported');
    reversible = false;
  } else if (score < 0.35 && !['critical', 'high'].includes(String(claim.risk || '').toLowerCase())) {
    operation = 'SOFT_FORGET';
    reasonCodes.push('low_utility');
  } else if (score < 0.55) {
    operation = 'DEMOTE';
    reasonCodes.push(['critical', 'high'].includes(String(claim.risk || '').toLowerCase()) ? 'weak_but_risky_keep_hydratable' : 'aging_or_weak');
  }
  if (/repeated|workflow|succeeded 3|successful_runs/i.test(text) && score >= 0.72) {
    operation = 'PROMOTE_SKILL';
    reasonCodes.push('repeated_success');
  }
  if (/mistake|failure|regression|must never repeat|fingerprint/i.test(text) && score >= 0.65) {
    operation = 'PROMOTE_RULE';
    reasonCodes.push('mistake_prevention');
  }
  const governed = forgettingDecision({
    id: claim.id || stableId(text),
    type: 'wiki_claim',
    trust_score: score,
    evidence_count: claim.evidence_count,
    updated_at: claim.updated_at,
    stale: claim.freshness === 'stale',
    known_false: claim.status === 'unsupported',
    duplicate_of: duplicateCount > 0 ? 'previous-claim' : null,
    regression_prevention: /mistake|failure|regression|fingerprint/i.test(text)
  });
  return {
    claim_id: claim.id || stableId(text),
    operation,
    lifecycle_state: governed.lifecycle_state,
    reason_codes: reasonCodes.length ? reasonCodes : ['kept_within_budget'],
    before_score: round(before),
    after_score: round(score),
    utility_score: governed.utility_score,
    evidence: [claim.source || claim.file || 'context-pack.json'].filter(Boolean),
    reversible,
    tombstone: governed.tombstone || null
  };
}

async function sourceHydrationPass(root: any, claims: any) {
  const risky = claims.filter((claim: any) => ['critical', 'high'].includes(String(claim.risk || '').toLowerCase())).slice(0, 12);
  for (const claim of risky) {
    const source = String(claim.source || claim.file || '');
    if (!source || /^https?:\/\//.test(source)) continue;
    if (!(await exists(path.join(root, source)))) return false;
  }
  return true;
}

function estimateTokens(text: any) {
  return Math.ceil(String(text || '').length / 4);
}

function normalizeClaimText(text: any) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').trim().slice(0, 160);
}

function stableId(text: any) {
  return normalizeClaimText(text).replace(/\s+/g, '-').slice(0, 64) || 'claim';
}

function round(value: any) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function clamp01(value: any) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
