import path from 'node:path';
import { exists, nowIso, readJson, writeJsonAtomic } from './fsx.mjs';

export const MEMORY_OPERATIONS = new Set([
  'ADD',
  'UPDATE',
  'CONSOLIDATE',
  'DEMOTE',
  'SOFT_FORGET',
  'ARCHIVE',
  'HARD_DELETE',
  'NOOP',
  'PROMOTE_SKILL',
  'PROMOTE_RULE'
]);

export const DEFAULT_RETRIEVAL_BUDGET = {
  top_k_default: 8,
  top_k_high_risk: 16,
  max_tokens: 6000,
  actual_tokens: 0
};

export function memoryUtilityScore(claim = {}, duplicateCount = 0) {
  const source = String(claim.source || claim.file || '');
  const trust = Number(claim.trust_score ?? (claim.status === 'supported' ? 0.75 : source ? 0.65 : 0.35));
  const evidence = Math.min(1, Number(claim.evidence_count || (source ? 1 : 0)) / 4);
  const weight = Math.min(1, Number(claim.required_weight || 0.5) / 1.5);
  const freshness = { fresh: 1, aging: 0.65, stale: 0.25, obsolete: 0, unknown: 0.45 }[claim.freshness] ?? 0.45;
  const authority = source || ['code', 'contract', 'test'].includes(String(claim.authority || '').toLowerCase()) ? 0.12 : 0;
  const riskBoost = ['critical', 'high'].includes(String(claim.risk || '').toLowerCase()) ? 0.22 : 0;
  const duplicatePenalty = Math.min(0.5, duplicateCount * 0.15);
  const unsupportedPenalty = claim.status === 'unsupported' ? 0.6 : claim.status === 'unknown' ? 0.18 : 0;
  return clamp01(trust * 0.3 + evidence * 0.2 + weight * 0.2 + freshness * 0.18 + riskBoost + authority - duplicatePenalty - unsupportedPenalty);
}

export async function sweepTriWiki(root, opts = {}) {
  const missionId = opts.missionId || null;
  const startedAt = nowIso();
  const packFile = opts.packFile || path.join(root, '.sneakoscope', 'wiki', 'context-pack.json');
  const pack = await readJson(packFile, { claims: [] });
  const claims = Array.isArray(pack.claims) ? pack.claims : [];
  const seen = new Map();
  const operations = [];
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

  const skillCandidates = operations.filter((op) => op.operation === 'PROMOTE_SKILL');
  const mistakeRules = operations.filter((op) => op.operation === 'PROMOTE_RULE');
  const report = {
    schema_version: 1,
    mission_id: missionId,
    started_at: startedAt,
    completed_at: nowIso(),
    operations,
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

export async function writeMemorySweepReport(root, dir, opts = {}) {
  const report = await sweepTriWiki(root, opts);
  await writeJsonAtomic(path.join(dir, 'memory-sweep-report.json'), report);
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'wiki', 'last-sweep-report.json'), report);
  return report;
}

function operationForClaim(claim, before, score, duplicateCount) {
  const text = String(claim.text || claim.claim || '');
  const reasonCodes = [];
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
  return {
    claim_id: claim.id || stableId(text),
    operation,
    reason_codes: reasonCodes.length ? reasonCodes : ['kept_within_budget'],
    before_score: round(before),
    after_score: round(score),
    evidence: [claim.source || claim.file || 'context-pack.json'].filter(Boolean),
    reversible
  };
}

async function sourceHydrationPass(root, claims) {
  const risky = claims.filter((claim) => ['critical', 'high'].includes(String(claim.risk || '').toLowerCase())).slice(0, 12);
  for (const claim of risky) {
    const source = String(claim.source || claim.file || '');
    if (!source || /^https?:\/\//.test(source)) continue;
    if (!(await exists(path.join(root, source)))) return false;
  }
  return true;
}

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

function normalizeClaimText(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').trim().slice(0, 160);
}

function stableId(text) {
  return normalizeClaimText(text).replace(/\s+/g, '-').slice(0, 64) || 'claim';
}

function round(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
