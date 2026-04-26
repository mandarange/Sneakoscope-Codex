import { buildWikiCoordinateIndex, compactWikiCoordinateIndex, normalizeWikiCoord, wikiCoordSimilarity } from './wiki-coordinate.mjs';

const TAU = 2 * Math.PI;

export function clamp01(x) { return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0)); }
export function wave(theta, phi) { return 0.5 + 0.5 * Math.cos(theta - phi); }

export function trigScore(missionCoord = {}, claimCoord = {}) {
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

export function claimScore(mission, claim) {
  const support = { supported: 1, weak: 0.55, unknown: 0.2, unsupported: -1, conflicted: -2, stale: 0.05 }[claim.status || 'unknown'] ?? 0;
  const authority = { code: 1, test: 0.95, contract: 0.9, vgraph: 0.8, beta: 0.7, wiki: 0.55, visual_parse: 0.45, model: -0.5 }[claim.authority || 'wiki'] ?? 0.5;
  const risk = { low: 0.1, medium: 0.35, high: 0.75, critical: 1 }[claim.risk || 'medium'] ?? 0.35;
  const freshness = { fresh: 1, unknown: 0.35, stale: -0.6 }[claim.freshness || 'unknown'] ?? 0.35;
  const tokenCost = Math.max(1, claim.tokenCost || String(claim.text || '').length / 4);
  const r = Number.isFinite(claim.concentration) ? claim.concentration : 0.75;
  const normCompensation = (1 - clamp01(r)) * Math.log1p(claim.evidence_count || 0) * 0.12;
  return trigScore(mission.coord, claim.coord) + support + authority + 0.3 * risk + 0.4 * freshness + normCompensation - 0.01 * tokenCost;
}

function topKByScore(items, k) {
  if (k <= 0) return [];
  const top = [];
  for (const item of items) {
    if (top.length < k) {
      top.push(item);
      if (top.length === k) top.sort((a, b) => a.score - b.score);
      continue;
    }
    if (item.score > top[0].score) {
      top[0] = item;
      top.sort((a, b) => a.score - b.score);
    }
  }
  return top.sort((a, b) => b.score - a.score);
}

export function selectClaims(mission, claims, budget = {}) {
  const maxClaims = Math.max(0, budget.maxClaims ?? 12);
  const scored = (claims || []).map((claim) => ({ claim, score: claimScore(mission, claim) }));
  const selected = [];
  const selectedIds = new Set();
  const required = scored
    .filter((x) => Number(x.claim.required_weight) > 0)
    .sort((a, b) => b.score - a.score);
  for (const item of required) {
    if (selected.length >= maxClaims) break;
    selected.push(item);
    selectedIds.add(item.claim.id);
  }
  const fill = topKByScore(scored.filter((x) => !selectedIds.has(x.claim.id)), maxClaims - selected.length);
  return [...selected, ...fill]
    .sort((a, b) => b.score - a.score)
    .map((x) => ({ ...x.claim, triwiki_score: Number(x.score.toFixed(4)) }));
}

export function geometricOffsets(max = 65536) {
  const out = [];
  for (let x = 1; x <= max; x *= 2) out.push(x);
  return out;
}

export function contextCapsule({ mission, role = 'worker', contractHash = null, claims = [], q4 = {}, q3 = [], budget = {} }) {
  const selected = selectClaims(mission, claims, { maxClaims: budget.maxClaims ?? (role.includes('verifier') ? 16 : 9) });
  const fullWiki = buildWikiCoordinateIndex({
    mission,
    claims,
    q4,
    q3,
    maxAnchors: budget.maxWikiAnchors ?? (role.includes('verifier') ? 16 : 7)
  });
  const wiki = budget.verboseWiki ? fullWiki : compactWikiCoordinateIndex(fullWiki);
  const anchorRows = Array.isArray(wiki.a) ? wiki.a : [];
  const anchorsById = new Map((wiki.anchors || []).map((anchor) => [anchor.id, anchor]));
  for (const row of anchorRows) anchorsById.set(row[0], { id: row[0], rgba: row[1], c: row[2], h: row[7] });
  return {
    mission: mission.id,
    role,
    contract_hash: contractHash,
    token_policy: 'Q4_Q3_DEFAULT_WITH_RGBA_TRIG_WIKI_ANCHORS_Q2_Q1_HYDRATED_ON_DEMAND',
    q4,
    q3,
    wiki,
    claims: selected.map((c) => {
      const anchor = anchorsById.get(c.id);
      return { id: c.id, text: c.text, status: c.status, risk: c.risk, source: c.source, score: c.triwiki_score, rgba: anchor?.rgba, h: anchor?.h };
    })
  };
}
