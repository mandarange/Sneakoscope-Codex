import path from 'node:path';
import fsp from 'node:fs/promises';
import { nowIso, readJson, sha256, writeJsonAtomic } from './fsx.mjs';

export const MISTAKE_RECALL_ARTIFACT = 'mistake-recall-ledger.json';
export const CLAIM_CONSUMPTION_ARTIFACT = 'claim-consumption-ledger.json';

const MISTAKE_CUE_RE = /\b(mistake|repeat|repeated|regression|forget|forgot|stale|drift|ambiguity|clarification|fallback|question|runtime|route|triwiki|wiki|voxel|memory)\b|반복|실수|또\s*|까먹|기억|모호|질문|복셀|검수|개선|정상\s*동작/i;

export async function buildMistakeRecallLedger(root, { prompt = '', answers = {}, maxMatches = 8 } = {}) {
  const seedText = `${prompt || ''}\n${JSON.stringify(answers || {})}`;
  const queryTerms = tokenize(seedText);
  const claims = [
    ...(await claimsFromContextPack(root)),
    ...(await claimsFromMemory(root))
  ];
  const scored = claims
    .map((claim) => ({ ...claim, ...scoreClaim(claim, queryTerms, seedText) }))
    .filter((claim) => claim.score >= 2.5 || (claim.mistake_cue && claim.overlap_count > 0))
    .sort((a, b) => (b.score - a.score) || String(a.id).localeCompare(String(b.id)))
    .slice(0, maxMatches);
  return {
    schema_version: 1,
    generated_at: nowIso(),
    prompt_hash: sha256(seedText),
    required: scored.length > 0,
    status: scored.length ? 'matched' : 'no_relevant_mistake_claims',
    query_terms: [...queryTerms].slice(0, 24),
    matches: scored.map((claim) => ({
      id: claim.id,
      text: claim.text,
      source: claim.source,
      file: claim.file || claim.source,
      reason: claim.reason,
      score: Number(claim.score.toFixed(3)),
      overlap_count: claim.overlap_count,
      required_weight: claim.required_weight,
      trust_score: claim.trust_score,
      risk: claim.risk,
      freshness: claim.freshness
    }))
  };
}

export function bindMistakeRecallToAnswers(answers = {}, ledger = {}) {
  if (!ledger?.required || !Array.isArray(ledger.matches) || !ledger.matches.length) return answers;
  const ids = ledger.matches.map((match) => match.id).filter(Boolean);
  const recallLine = `TriWiki mistake recall consumed before implementation: ${ids.join(', ')}`;
  const riskBoundary = Array.isArray(answers.RISK_BOUNDARY)
    ? [...answers.RISK_BOUNDARY]
    : String(answers.RISK_BOUNDARY || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!riskBoundary.includes(recallLine)) riskBoundary.push(recallLine);
  const acceptance = Array.isArray(answers.ACCEPTANCE_CRITERIA)
    ? [...answers.ACCEPTANCE_CRITERIA]
    : String(answers.ACCEPTANCE_CRITERIA || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const acceptanceLine = 'mistake-recall-ledger.json is consumed by the decision contract when relevant TriWiki mistakes are found';
  if (!acceptance.includes(acceptanceLine)) acceptance.push(acceptanceLine);
  return {
    ...answers,
    RISK_BOUNDARY: riskBoundary,
    ACCEPTANCE_CRITERIA: acceptance,
    TRIWIKI_MISTAKE_RECALL_REQUIRED: true,
    TRIWIKI_MISTAKE_RECALL_IDS: ids,
    TRIWIKI_MISTAKE_RECALL_STATUS: ledger.status
  };
}

export function mistakeRecallContractSummary(ledger = {}) {
  if (!ledger?.required) return { required: false, status: ledger?.status || 'not_required', matches: [] };
  return {
    required: true,
    status: ledger.status,
    artifact: MISTAKE_RECALL_ARTIFACT,
    match_count: ledger.matches?.length || 0,
    ids: (ledger.matches || []).map((match) => match.id).filter(Boolean),
    sources: [...new Set((ledger.matches || []).map((match) => match.source).filter(Boolean))].slice(0, 8)
  };
}

export function contractConsumesMistakeRecall(contract = {}, ledger = {}) {
  if (!ledger?.required) return { ok: true, missing: [] };
  const ids = (ledger.matches || []).map((match) => match.id).filter(Boolean);
  if (!ids.length) return { ok: true, missing: [] };
  const contractText = JSON.stringify(contract || {});
  const missing = ids.filter((id) => !contractText.includes(id));
  const summary = contract?.triwiki_mistake_recall;
  if (!summary?.required) missing.push('contract.triwiki_mistake_recall.required');
  if (summary?.artifact !== MISTAKE_RECALL_ARTIFACT) missing.push('contract.triwiki_mistake_recall.artifact');
  return { ok: missing.length === 0, missing };
}

export async function writeMistakeRecallArtifacts(missionDir, ledger = {}, contract = {}) {
  await writeJsonAtomic(path.join(missionDir, MISTAKE_RECALL_ARTIFACT), ledger);
  const consumption = {
    schema_version: 1,
    generated_at: nowIso(),
    artifact: MISTAKE_RECALL_ARTIFACT,
    contract_hash: contract?.sealed_hash || null,
    ...contractConsumesMistakeRecall(contract, ledger)
  };
  await writeJsonAtomic(path.join(missionDir, CLAIM_CONSUMPTION_ARTIFACT), consumption);
  return consumption;
}

export async function mistakeRecallGateStatus(root, state = {}) {
  const id = state?.mission_id;
  if (!id) return { ok: true, missing: [] };
  const dir = path.join(root, '.sneakoscope', 'missions', id);
  const ledger = await readJson(path.join(dir, MISTAKE_RECALL_ARTIFACT), null);
  if (!ledger) return { ok: true, missing: [] };
  if (!ledger.required) return { ok: true, missing: [] };
  const contract = await readJson(path.join(dir, 'decision-contract.json'), null);
  if (!contract) return { ok: false, missing: ['decision-contract.json'] };
  const consumed = contractConsumesMistakeRecall(contract, ledger);
  return {
    ok: consumed.ok,
    missing: consumed.missing || [],
    source: path.join('.sneakoscope', 'missions', id, MISTAKE_RECALL_ARTIFACT)
  };
}

async function claimsFromContextPack(root) {
  const pack = await readJson(path.join(root, '.sneakoscope', 'wiki', 'context-pack.json'), null);
  const claims = [];
  for (const claim of Array.isArray(pack?.claims) ? pack.claims : []) {
    if (!claim?.id || !claim?.text) continue;
    claims.push({
      id: String(claim.id),
      text: String(claim.text).slice(0, 420),
      source: claim.source || '.sneakoscope/wiki/context-pack.json',
      file: claim.source || '.sneakoscope/wiki/context-pack.json',
      authority: claim.authority || 'wiki',
      risk: claim.risk || 'medium',
      freshness: claim.freshness || 'unknown',
      trust_score: numberOrUndefined(claim.trust_score)
    });
  }
  return claims;
}

async function claimsFromMemory(root) {
  const base = path.join(root, '.sneakoscope', 'memory');
  const files = await listClaimFiles(base);
  const rows = [];
  for (const file of files.slice(0, 120)) {
    const rel = path.relative(root, file);
    let text = '';
    try {
      text = await fsp.readFile(file, 'utf8');
    } catch {
      continue;
    }
    rows.push(...parseClaimRows(text, rel));
  }
  return rows;
}

async function listClaimFiles(base) {
  const out = [];
  async function walk(dir, depth = 0) {
    if (depth > 3) return;
    let entries = [];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file, depth + 1);
      else if (/\.(md|txt|json)$/i.test(entry.name)) out.push(file);
    }
  }
  await walk(base);
  return out;
}

function parseClaimRows(text, relFile) {
  if (/\.json$/i.test(relFile)) {
    try {
      const parsed = JSON.parse(text);
      const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.claims) ? parsed.claims : []);
      return rows.map((row) => normalizeClaim(row, relFile)).filter(Boolean);
    } catch {
      return [];
    }
  }
  return String(text || '').split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => normalizeClaim(line.replace(/^[-*]\s*/, ''), relFile))
    .filter(Boolean);
}

function normalizeClaim(row, relFile) {
  if (!row) return null;
  if (typeof row === 'object') {
    const text = String(row.text || row.claim || '').trim();
    if (!text) return null;
    return {
      id: row.id ? String(row.id) : `memory-${slug(relFile)}-${sha256(text).slice(0, 8)}`,
      text: text.slice(0, 420),
      source: row.source || row.file || relFile,
      file: row.file || row.source || relFile,
      risk: row.risk || 'medium',
      freshness: row.freshness || 'unknown',
      required_weight: numberOrUndefined(row.required_weight),
      trust_score: numberOrUndefined(row.trust_score)
    };
  }
  const clean = String(row || '').trim();
  if (!/\bclaim\s*:/i.test(clean)) return null;
  const claimText = clean.replace(/^claim\s*:\s*/i, '').trim();
  return {
    id: extractField(clean, 'id') || `memory-${slug(relFile)}-${sha256(clean).slice(0, 8)}`,
    text: claimText.slice(0, 420),
    source: extractField(clean, 'source') || extractField(clean, 'file') || relFile,
    file: extractField(clean, 'file') || extractField(clean, 'source') || relFile,
    risk: extractField(clean, 'risk') || 'medium',
    freshness: extractField(clean, 'freshness') || 'unknown',
    required_weight: numberOrUndefined(extractField(clean, 'required_weight')),
    trust_score: numberOrUndefined(extractField(clean, 'trust_score'))
  };
}

function scoreClaim(claim, queryTerms, seedText) {
  const hay = `${claim.id || ''} ${claim.text || ''} ${claim.source || ''}`.toLowerCase();
  let overlap = 0;
  for (const term of queryTerms) if (hay.includes(term)) overlap += 1;
  const mistakeCue = MISTAKE_CUE_RE.test(hay);
  const seedMistakeCue = MISTAKE_CUE_RE.test(seedText || '');
  const required = Number(claim.required_weight || 0);
  const trust = Number(claim.trust_score || 0);
  const risk = { low: 0, medium: 0.25, high: 0.75, critical: 1.1 }[claim.risk || 'medium'] ?? 0.25;
  const freshness = { fresh: 0.45, unknown: 0.1, stale: -0.25 }[claim.freshness || 'unknown'] ?? 0.1;
  const score = overlap + required * 3.5 + trust * 1.5 + risk + freshness + (mistakeCue ? 2 : 0) + (seedMistakeCue && mistakeCue ? 1 : 0);
  return {
    score,
    overlap_count: overlap,
    mistake_cue: mistakeCue,
    reason: [
      overlap ? `prompt_overlap:${overlap}` : null,
      mistakeCue ? 'mistake_cue' : null,
      required ? `required_weight:${required}` : null,
      trust ? `trust:${trust}` : null
    ].filter(Boolean).join(',')
  };
}

function tokenize(text) {
  const out = new Set();
  for (const match of String(text || '').toLowerCase().matchAll(/[a-z0-9_/-]{3,}|[가-힣]{2,}/g)) {
    const token = match[0].replace(/^[-_/]+|[-_/]+$/g, '');
    if (token && !STOP_TERMS.has(token)) out.add(token);
  }
  return out;
}

const STOP_TERMS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'true', 'false',
  '사용자', '요청', '현재', '코드', '기준', '구현', '작업', '완료', '검증'
]);

function extractField(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(text || '').match(new RegExp(`\\b${escaped}\\s*[:=]\\s*\\\`?([^\\\`|,;]+)`, 'i'));
  return match ? match[1].trim().replace(/[.;)]$/, '') : null;
}

function numberOrUndefined(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function slug(value) {
  return String(value || 'claim').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'claim';
}
