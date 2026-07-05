import { WIKI_VOXEL_LAYERS, buildWikiCoordinateIndex, compactWikiCoordinateIndex, normalizeWikiCoord, wikiCoordSimilarity } from './wiki-coordinate.js';

const TAU = 2 * Math.PI;

export const DEFAULT_TRUST_POLICY = {
  schema_version: 1,
  score_range: [0, 1],
  bands: [
    { band: 'high', min: 0.8, action: 'use' },
    { band: 'medium', min: 0.55, action: 'verify' },
    { band: 'low', min: 0.3, action: 'limit' },
    { band: 'untrusted', min: 0, action: 'exclude' }
  ],
  weights: {
    support: 0.4,
    authority: 0.25,
    freshness: 0.18,
    evidence: 0.17,
    risk_penalty: 0.28
  }
};

export function clamp01(x: any) { return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0)); }
export function wave(theta: any, phi: any) { return 0.5 + 0.5 * Math.cos(theta - phi); }

export function trigScore(missionCoord: any = {}, claimCoord: any = {}) {
  const missionWikiCoord = normalizeWikiCoord(missionCoord, 'mission');
  const claimWikiCoord = normalizeWikiCoord(claimCoord, 'claim');
  const domainDelta = (missionWikiCoord.domainAngle || 0) - (claimWikiCoord.domainAngle || 0);
  const layerDelta = (missionWikiCoord.layerRadius || 0) - (claimWikiCoord.layerRadius || 0);
  const phaseDelta = (missionWikiCoord.phase || 0) - (claimWikiCoord.phase || 0);
  return (
    0.32 * wave(domainDelta, 0) +
    0.18 * wave(layerDelta * 0.7, 0) +
    0.22 * wave(phaseDelta, 0) +
    0.28 * wikiCoordSimilarity(missionWikiCoord, claimWikiCoord)
  );
}

export function claimScore(mission: any, claim: any) {
  const support = ({ supported: 1, weak: 0.55, unknown: 0.2, unsupported: -1, conflicted: -2, stale: 0.05 } as Record<string, number>)[claim.status || 'unknown'] ?? 0;
  const authority = ({ code: 1, test: 0.95, contract: 0.9, vgraph: 0.8, beta: 0.7, wiki: 0.55, visual_parse: 0.45, model: -0.5 } as Record<string, number>)[claim.authority || 'wiki'] ?? 0.5;
  const risk = ({ low: 0.1, medium: 0.35, high: 0.75, critical: 1 } as Record<string, number>)[claim.risk || 'medium'] ?? 0.35;
  const freshness = ({ fresh: 1, unknown: 0.35, stale: -0.6 } as Record<string, number>)[claim.freshness || 'unknown'] ?? 0.35;
  const tokenCost = Math.max(1, claim.tokenCost || String(claim.text || '').length / 4);
  const r = Number.isFinite(claim.concentration) ? claim.concentration : 0.75;
  const normCompensation = (1 - clamp01(r)) * Math.log1p(claim.evidence_count || 0) * 0.12;
  return trigScore(mission.coord, claim.coord) + support + authority + 0.3 * risk + 0.4 * freshness + normCompensation - 0.01 * tokenCost;
}

function round4(x: any) { return Number(clamp01(x).toFixed(4)); }

function trustEvidenceScore(claim: any = {}) {
  const explicitCount = Number(claim.evidence_count);
  const evidenceCount = Number.isFinite(explicitCount)
    ? explicitCount
    : (Array.isArray(claim.evidence) ? claim.evidence.length : 0);
  return clamp01(Math.log1p(Math.max(0, evidenceCount)) / Math.log1p(8));
}

export function trustScore(claim: any = {}, policy: any = DEFAULT_TRUST_POLICY) {
  const explicitTrust = Number(claim.trust_score);
  if (Number.isFinite(explicitTrust)) return round4(explicitTrust);
  const weights = { ...DEFAULT_TRUST_POLICY.weights, ...(policy?.weights || {}) };
  const support = ({ supported: 1, weak: 0.62, stale: 0.35, unknown: 0.32, unsupported: 0.06, conflicted: 0 } as Record<string, number>)[claim.status || 'unknown'] ?? 0.32;
  const authority = ({ code: 1, test: 0.96, contract: 0.9, vgraph: 0.78, beta: 0.68, wiki: 0.55, visual_parse: 0.45, model: 0.18 } as Record<string, number>)[claim.authority || 'wiki'] ?? 0.5;
  const freshness = ({ fresh: 1, unknown: 0.55, stale: 0.18 } as Record<string, number>)[claim.freshness || 'unknown'] ?? 0.55;
  const riskPenalty = ({ low: 0.04, medium: 0.18, high: 0.58, critical: 1 } as Record<string, number>)[claim.risk || 'medium'] ?? 0.18;
  const evidence = trustEvidenceScore(claim);
  return round4(
    weights.support * support +
    weights.authority * authority +
    weights.freshness * freshness +
    weights.evidence * evidence -
    weights.risk_penalty * riskPenalty
  );
}

export function trustBand(scoreOrClaim: any, policy: any = DEFAULT_TRUST_POLICY) {
  const value = typeof scoreOrClaim === 'object' && scoreOrClaim !== null
    ? trustScore(scoreOrClaim, policy)
    : clamp01(Number(scoreOrClaim));
  const bands = [...(policy?.bands || DEFAULT_TRUST_POLICY.bands)].sort((a: any, b: any) => Number(b.min) - Number(a.min));
  return (bands.find((band: any) => value >= Number(band.min || 0)) || bands[bands.length - 1] || DEFAULT_TRUST_POLICY.bands[3]).band;
}

export function trustAction(scoreOrBand: any, policy: any = DEFAULT_TRUST_POLICY) {
  if (typeof scoreOrBand === 'object' && scoreOrBand !== null) {
    if (typeof scoreOrBand.trust_action === 'string') return scoreOrBand.trust_action;
    if (typeof scoreOrBand.trust_band === 'string') return trustAction(scoreOrBand.trust_band, policy);
    return trustAction(trustScore(scoreOrBand, policy), policy);
  }
  const band = typeof scoreOrBand === 'string' ? scoreOrBand : trustBand(scoreOrBand, policy);
  const bands = policy?.bands || DEFAULT_TRUST_POLICY.bands;
  return (bands.find((entry: any) => entry.band === band) || DEFAULT_TRUST_POLICY.bands[3]).action;
}

function withTrust(claim: any, policy: any = DEFAULT_TRUST_POLICY) {
  const trust_score = trustScore(claim, policy);
  const trust_band = trustBand(trust_score, policy);
  return { ...claim, trust_score, trust_band };
}

export function trustSummary(claims: any = [], policy: any = DEFAULT_TRUST_POLICY) {
  const rows = (claims || []).map((claim: any) => withTrust(claim, policy));
  const action_counts: Record<string, number> = {};
  const band_counts: Record<string, number> = {};
  let total = 0;
  let min = rows.length ? 1 : 0;
  for (const row of rows) {
    total += row.trust_score;
    min = Math.min(min, row.trust_score);
    const action = trustAction(row.trust_band, policy);
    action_counts[action] = (action_counts[action] || 0) + 1;
    band_counts[row.trust_band] = (band_counts[row.trust_band] || 0) + 1;
  }
  return {
    claims: rows.length,
    avg: rows.length ? round4(total / rows.length) : 0,
    min: round4(min),
    bands: band_counts,
    actions: action_counts,
    needs_evidence: (action_counts.verify || 0) + (action_counts.limit || 0) + (action_counts.exclude || 0)
  };
}

function topKByScore(items: any, k: any) {
  if (k <= 0) return [];
  const top: any[] = [];
  for (const item of items) {
    if (top.length < k) {
      top.push(item);
      if (top.length === k) top.sort((a: any, b: any) => a.score - b.score);
      continue;
    }
    if (item.score > top[0].score) {
      top[0] = item;
      top.sort((a: any, b: any) => a.score - b.score);
    }
  }
  return top.sort((a: any, b: any) => b.score - a.score);
}

function attentionAnchorMap(wiki: any = {}) {
  const anchors = new Map();
  for (const anchor of Array.isArray(wiki.anchors) ? wiki.anchors : []) {
    anchors.set(anchor.id, { id: anchor.id, rgba: anchor.rgba, h: anchor.h, source: anchor.src });
  }
  for (const row of Array.isArray(wiki.a) ? wiki.a : []) {
    anchors.set(row[0], { id: row[0], rgba: row[1], h: row[7], source: row[6] });
  }
  return anchors;
}

function attentionRow(claim: any, anchor: any, reason: any = '') {
  return reason ? [claim.id, reason] : [claim.id, anchor?.rgba, anchor?.h];
}

const NEGATIVE_PRIMING_RE = /\b(do\s+not|don't|dont|never|avoid|forbid(?:den)?|must\s+not|unsupported|conflicted)\b|하지\s*마|하지\s*말|말아야|금지|안\s*(?:돼|됨|된다)|비\s*상식/i;

export function negativePrimingRisk(claim: any = {}) {
  return NEGATIVE_PRIMING_RE.test(String(claim.text || claim.claim || ''));
}

export function positiveRecallText(claim: any = {}) {
  const text = String(claim.text || claim.claim || '').trim();
  if (!negativePrimingRisk({ ...claim, text })) return text;
  const route = `${claim.id || ''} ${claim.source || ''} ${claim.file || ''} ${text}`.toLowerCase();
  if (/dfix/.test(route)) return 'Keep DFix on the ultralight route with a concise completion summary and cheap verification.';
  if (/computer[-_\s]?use|playwright|selenium|puppeteer|browser automation|chrome mcp|chrome extension/.test(route)) return 'Use Codex Chrome Extension first for web/browser verification, and reserve Codex Computer Use for native Mac/non-web visual claims.';
  if (/fallback|substitute|compatibility shim|mock behavior/.test(route)) return 'Implement the requested path directly and block with evidence when that path is impossible.';
  if (/clarification|ambiguity|question|ask|질문|모호/.test(route)) return 'Infer safely from current code, TriWiki, and conservative defaults without surfacing a prequestion sheet.';
  if (/triwiki|wiki|cache|attention|hydrate|memory|메모리/.test(route)) return 'Use positive TriWiki target recall: selected cache-hit anchors first, with source hydration before risky claims.';
  return `Follow the positive target behavior for ${claim.id || claim.source || 'this guardrail'}; hydrate source before acting on the guardrail.`;
}

function hydrateReason(claim: any = {}) {
  const action = trustAction(claim);
  if (action !== 'use') return `trust_action:${action}`;
  if (negativePrimingRisk(claim)) return 'negative_priming:hydrate_source';
  if (['high', 'critical'].includes(claim.risk)) return `risk:${claim.risk}`;
  if (claim.status !== 'supported') return `status:${claim.status || 'unknown'}`;
  return '';
}

function voxelHydrateCandidates(wiki: any = {}, anchors: any = new Map(), max: any = 4) {
  const overlay = wiki.vx || wiki.voxel_overlay;
  const rows = Array.isArray(overlay?.v) ? overlay.v : [];
  const layers = Array.isArray(overlay?.l) ? overlay.l : WIKI_VOXEL_LAYERS;
  const idx = Object.fromEntries(layers.map((layer: any, index: any) => [layer, index]));
  return rows
    .map((row: any) => {
      const id = row?.[1];
      const values = Array.isArray(row?.[2]) ? row[2] : [];
      const anchor = anchors.get(id);
      if (!id || !anchor) return null;
      const prio = Number(values[idx.prio] || 0);
      const conflict = Number(values[idx.conflict] || 0);
      const route = Number(values[idx.route] || 0);
      const trust = Number(values[idx.trust] || 0);
      const fresh = Number(values[idx.fresh] || 0);
      let reason = '';
      if (conflict >= 0.35) reason = `voxel:conflict:${conflict.toFixed(2)}`;
      else if (prio >= 0.92 && route >= 0.4) reason = `voxel:priority_route:${prio.toFixed(2)}`;
      else if (prio >= 0.75 && fresh <= 0.25) reason = `voxel:stale_priority:${prio.toFixed(2)}`;
      if (!reason) return null;
      return {
        id,
        anchor,
        reason,
        score: conflict * 3 + prio * 2 + route + (1 - trust) * 0.8 + (1 - fresh) * 0.5
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => (b.score - a.score) || String(a.id).localeCompare(String(b.id)))
    .slice(0, max);
}

function uniqueAttentionRows(rows: any = [], max: any = 4) {
  const out: any[] = [];
  const seen = new Set();
  for (const row of rows) {
    if (!Array.isArray(row) || !row[0] || seen.has(row[0])) continue;
    seen.add(row[0]);
    out.push(row);
    if (out.length >= max) break;
  }
  return out;
}

/** Ranks code-pack entries (LLM-consumable, source-cited codebase summaries — see
 * src/core/triwiki/code-pack.ts) by trust_score into a dedicated attention sub-budget,
 * independent of the policy-claim RGBA/geometric selection above: code entries carry
 * no meaningful mission-coordinate proximity, so competing them against policy claims
 * for the same fixed slot budget would make their appearance arbitrary. Each surviving
 * entry becomes a use_first row (bare id, no fabricated RGBA) plus a hydrate_first row
 * pointing at its source citations, so a consumer knows which real files back it. */
function codePackAttentionRows(codePackEntries: any[] = [], tokenBudget = 2000): { useFirst: any[]; hydrateFirst: any[] } {
  const sorted = [...(codePackEntries || [])]
    .filter((entry: any) => entry && typeof entry.id === 'string')
    .sort((a: any, b: any) => Number(b.trust_score || 0) - Number(a.trust_score || 0));
  const useFirst: any[] = [];
  const hydrateFirst: any[] = [];
  let tokens = 0;
  for (const entry of sorted) {
    const cost = Number(entry.token_cost) || Math.max(1, Math.ceil(String(entry.text || '').length / 4));
    if (tokens + cost > tokenBudget) continue;
    tokens += cost;
    useFirst.push([entry.id, null, null]);
    const citationPaths = Array.isArray(entry.citations) ? entry.citations.map((c: any) => c?.path).filter(Boolean) : [];
    if (citationPaths.length) hydrateFirst.push([entry.id, `code_citations:${citationPaths.join(',')}`]);
  }
  return { useFirst, hydrateFirst };
}

export function buildTriWikiAttention({ selected = [], wiki = {}, role = 'worker', maxUse = 4, maxHydrate = 4, codePackEntries = [], codePackTokenBudget = 2000 }: any = {}) {
  const anchors = attentionAnchorMap(wiki);
  const ranked = [...(selected || [])]
    .map((claim: any, index: any) => ({ claim, index }))
    .filter(({ claim }: any) => anchors.has(claim.id))
    .sort((a: any, b: any) =>
      (Number(b.claim.required_weight || 0) - Number(a.claim.required_weight || 0)) ||
      (Number(b.claim.triwiki_score || 0) - Number(a.claim.triwiki_score || 0)) ||
      (Number(b.claim.trust_score || 0) - Number(a.claim.trust_score || 0)) ||
      a.index - b.index
    )
    .map(({ claim }: any) => claim);
  const useFirst = ranked
    .filter((claim: any) => trustAction(claim) === 'use')
    .slice(0, maxUse)
    .map((claim: any) => attentionRow(claim, anchors.get(claim.id)));
  const selectedHydrateRows = ranked
    .map((claim: any) => ({ claim, reason: hydrateReason(claim) }))
    .filter((item: any) => item.reason)
    .map((item: any) => attentionRow(item.claim, anchors.get(item.claim.id), item.reason));
  const negativeHydrateRows = selectedHydrateRows.filter((row: any) => String(row[1] || '').includes('negative_priming'));
  const voxelRows = voxelHydrateCandidates(wiki, anchors, maxHydrate)
    .map((item: any) => attentionRow({ id: item.id }, item.anchor, item.reason));
  const hydrateFirst = uniqueAttentionRows([
    ...negativeHydrateRows,
    ...voxelRows,
    ...selectedHydrateRows
  ], maxHydrate);
  const codeRows = codePackAttentionRows(codePackEntries, codePackTokenBudget);
  return {
    mode: 'aggressive_triwiki_active_recall',
    use_first: uniqueAttentionRows([...useFirst, ...codeRows.useFirst], maxUse + codeRows.useFirst.length),
    hydrate_first: uniqueAttentionRows([...hydrateFirst, ...codeRows.hydrateFirst], maxHydrate + codeRows.hydrateFirst.length)
  };
}

export function selectClaims(mission: any, claims: any, budget: any = {}) {
  const maxClaims = Math.max(0, budget.maxClaims ?? 12);
  const trustPolicy = budget.trustPolicy || DEFAULT_TRUST_POLICY;
  const scored = (claims || []).map((claim: any) => ({ claim, score: claimScore(mission, claim) }));
  const selected: any[] = [];
  const selectedIds = new Set();
  const required = scored
    .filter((x: any) => Number(x.claim.required_weight) > 0)
    .sort((a: any, b: any) => (Number(b.claim.required_weight) - Number(a.claim.required_weight)) || b.score - a.score);
  for (const item of required) {
    if (selected.length >= maxClaims) break;
    selected.push(item);
    selectedIds.add(item.claim.id);
  }
  const fill = topKByScore(scored.filter((x: any) => !selectedIds.has(x.claim.id)), maxClaims - selected.length);
  return [...selected, ...fill]
    .sort((a: any, b: any) => (Number(b.claim.required_weight || 0) - Number(a.claim.required_weight || 0)) || b.score - a.score)
    .map((x: any) => withTrust({ ...x.claim, triwiki_score: Number(x.score.toFixed(4)) }, trustPolicy));
}

export function geometricOffsets(max: any = 65536) {
  const out: any[] = [];
  for (let x = 1; x <= max; x *= 2) out.push(x);
  return out;
}

export function contextCapsule({ mission, role = 'worker', contractHash = null, claims = [], q4 = {}, q3 = [], budget = {}, codePackEntries = [] }: any) {
  const trustPolicy = budget.trustPolicy || DEFAULT_TRUST_POLICY;
  const claimsWithTrust = (claims || []).map((claim: any) => withTrust(claim, trustPolicy));
  const selected = selectClaims(mission, claims, { maxClaims: budget.maxClaims ?? (role.includes('verifier') ? 16 : 9), trustPolicy });
  const fullWiki = buildWikiCoordinateIndex({
    mission,
    claims: claimsWithTrust,
    q4,
    q3,
    maxAnchors: budget.maxWikiAnchors ?? (role.includes('verifier') ? 16 : 7),
    pinAnchorIds: selected.map((claim: any) => claim.id)
  });
  const wiki: any = budget.verboseWiki ? fullWiki : compactWikiCoordinateIndex(fullWiki);
  const anchorRows = Array.isArray(wiki.a) ? wiki.a : [];
  const anchorsById = new Map((wiki.anchors || []).map((anchor: any) => [anchor.id, anchor]));
  for (const row of anchorRows) anchorsById.set(row[0], { id: row[0], rgba: row[1], c: row[2], h: row[7] });
  return {
    mission: mission.id,
    role,
    contract_hash: contractHash,
    token_policy: 'Q4_Q3_TRIWIKI_ATTENTION_HYDRATE_ON_DEMAND',
    ...(budget.includeTrustSummary ? { trust_summary: trustSummary(selected, trustPolicy) } : {}),
    q4,
    q3,
    wiki,
    attention: buildTriWikiAttention({
      selected,
      wiki,
      role,
      maxUse: budget.maxAttentionUse ?? (role.includes('verifier') ? 7 : 4),
      maxHydrate: budget.maxAttentionHydrate ?? (role.includes('verifier') ? 7 : 4),
      codePackEntries,
      codePackTokenBudget: budget.codePackTokenBudget ?? 2000
    }),
    claims: selected.map((c: any) => {
      const anchor = anchorsById.get(c.id);
      const text = positiveRecallText(c);
      const anchorAny: any = anchor || {};
      const row: Record<string, unknown> = {
        id: c.id,
        text,
        source: c.source,
        rgba: anchorAny.rgba,
        h: anchorAny.h
      };
      if (text !== String(c.text || '')) row.text_policy = 'positive_recall_negation_suppressed';
      if (budget.verboseClaims) {
        row.status = c.status;
        row.risk = c.risk;
        row.score = c.triwiki_score;
        row.trust = c.trust_score;
      }
      return row;
    })
  };
}
