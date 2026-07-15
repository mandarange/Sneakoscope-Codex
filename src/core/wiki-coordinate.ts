import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from './fsx.js';

export const WIKI_COORD_SCHEMA = 'sks.wiki-coordinate.v1';
export const WIKI_VOXEL_SCHEMA = 'sks.wiki-voxel.v1';
export const WIKI_TAU = Math.PI * 2;
export const WIKI_VOXEL_LAYERS = Object.freeze(['sem', 'trust', 'fresh', 'prio', 'conflict', 'route', 'cost']);
export const DEFAULT_WIKI_VOXEL_QUANTIZATION = Object.freeze({ domain: 64, radius: 16, phase: 64 });

export function clamp01(x: any) {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}

function round6(x: any) {
  return Number((Number.isFinite(x) ? x : 0).toFixed(6));
}

function byte(x: any) {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(Number(x)) ? Number(x) : 0)));
}

function wrapTau(x: any) {
  const value = Number.isFinite(Number(x)) ? Number(x) : 0;
  return ((value % WIKI_TAU) + WIKI_TAU) % WIKI_TAU;
}

function hasOwn(obj: any = {}, key: any) {
  return Object.prototype.hasOwnProperty.call(Object(obj), key);
}

function trustFieldsFrom(source: any = {}): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (hasOwn(source, 'trust_score')) fields.trust_score = source.trust_score;
  if (hasOwn(source, 'trust_band')) fields.trust_band = source.trust_band;
  return fields;
}

function appendTrustSlots(row: any, anchor: any = {}) {
  const trustSlots = [
    hasOwn(anchor, 'trust_score') ? anchor.trust_score : null,
    hasOwn(anchor, 'trust_band') ? anchor.trust_band : null
  ];
  while (trustSlots.length && trustSlots.at(-1) == null) trustSlots.pop();
  return trustSlots.length ? [...row, ...trustSlots] : row;
}

function round4(x: any) {
  return Number((Number.isFinite(x) ? x : 0).toFixed(4));
}

export function rgbaFromHash(seed: any = '') {
  const hex = sha256(String(seed || 'wiki-anchor'));
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
    a: 160 + (Number.parseInt(hex.slice(6, 8), 16) % 96)
  };
}

export function rgbaKey(rgba: any = {}) {
  const c = normalizeRgba(rgba);
  return [c.r, c.g, c.b, c.a].map((x: any) => x.toString(16).padStart(2, '0')).join('');
}

export function normalizeRgba(rgba: any = {}) {
  if (Array.isArray(rgba)) return { r: byte(rgba[0]), g: byte(rgba[1]), b: byte(rgba[2]), a: byte(rgba[3] ?? 255) };
  if (typeof rgba === 'string') {
    const clean = rgba.replace(/^#/, '').replace(/[^0-9a-f]/gi, '');
    if (clean.length >= 6) {
      return {
        r: Number.parseInt(clean.slice(0, 2), 16),
        g: Number.parseInt(clean.slice(2, 4), 16),
        b: Number.parseInt(clean.slice(4, 6), 16),
        a: clean.length >= 8 ? Number.parseInt(clean.slice(6, 8), 16) : 255
      };
    }
  }
  return { r: byte(rgba.r), g: byte(rgba.g), b: byte(rgba.b), a: byte(rgba.a ?? 255) };
}

export function rgbaToWikiCoord(rgba: any = {}) {
  const c = normalizeRgba(rgba);
  const alpha = c.a / 255;
  const domainAngle = WIKI_TAU * ((c.r + 0.5) / 256);
  const layerRadius = Math.sin(((c.g + 0.5) / 256) * (Math.PI / 2));
  const phase = WIKI_TAU * ((c.b + 0.5) / 256);
  const concentration = 0.05 + 0.95 * alpha;
  return compactWikiCoord({ domainAngle, layerRadius, phase, concentration, rgba: c });
}

export function wikiCoordToRgba(coord: any = {}) {
  const domainAngle = wrapTau(coord.domainAngle);
  const phase = wrapTau(coord.phase);
  const layerRadius = clamp01(coord.layerRadius);
  const concentration = clamp01(coord.concentration ?? 1);
  return {
    r: byte((domainAngle / WIKI_TAU) * 256 - 0.5),
    g: byte((Math.asin(layerRadius) / (Math.PI / 2)) * 256 - 0.5),
    b: byte((phase / WIKI_TAU) * 256 - 0.5),
    a: byte(((concentration - 0.05) / 0.95) * 255)
  };
}

export function normalizeWikiCoord(coord: any = {}, seed: any = '') {
  if (coord?.rgba) return rgbaToWikiCoord(coord.rgba);
  if (coord && ['domainAngle', 'layerRadius', 'phase'].some((key: any) => Number.isFinite(Number(coord[key])))) {
    return compactWikiCoord({
      domainAngle: wrapTau(coord.domainAngle),
      layerRadius: clamp01(Number(coord.layerRadius)),
      phase: wrapTau(coord.phase),
      concentration: clamp01(Number(coord.concentration ?? 0.85)),
      rgba: coord.rgba || wikiCoordToRgba(coord)
    });
  }
  return rgbaToWikiCoord(rgbaFromHash(seed));
}

export function compactWikiCoord(coord: any = {}) {
  const domainAngle = wrapTau(coord.domainAngle);
  const layerRadius = clamp01(Number(coord.layerRadius));
  const phase = wrapTau(coord.phase);
  const concentration = clamp01(Number(coord.concentration ?? 1));
  const rgba = normalizeRgba(coord.rgba || wikiCoordToRgba({ domainAngle, layerRadius, phase, concentration }));
  return {
    schema: WIKI_COORD_SCHEMA,
    rgba,
    domainAngle: round6(domainAngle),
    layerRadius: round6(layerRadius),
    phase: round6(phase),
    concentration: round6(concentration),
    xyzw: [
      round6(concentration * Math.cos(domainAngle)),
      round6(concentration * Math.sin(domainAngle)),
      round6(layerRadius * Math.cos(phase)),
      round6(layerRadius * Math.sin(phase))
    ]
  };
}

export function wikiCoordSimilarity(a: any = {}, b: any = {}) {
  const ca = normalizeWikiCoord(a, 'a');
  const cb = normalizeWikiCoord(b, 'b');
  const domain = 0.5 + 0.5 * Math.cos(ca.domainAngle - cb.domainAngle);
  const phase = 0.5 + 0.5 * Math.cos(ca.phase - cb.phase);
  const layer = 1 - Math.min(1, Math.abs(ca.layerRadius - cb.layerRadius));
  const concentration = 1 - Math.min(1, Math.abs(ca.concentration - cb.concentration));
  return clamp01((0.42 * domain) + (0.26 * layer) + (0.24 * phase) + (0.08 * concentration));
}

export function wikiAnchorFromClaim(claim: any = {}, index: any = 0) {
  const id = String(claim.id || `claim-${index + 1}`);
  const text = String(claim.text || claim.label || id);
  const coord = normalizeWikiCoord(claim.coord || {}, `${id}:${text}`);
  const source = claim.source || claim.authority || 'wiki';
  return {
    id,
    rgba: rgbaKey(coord.rgba),
    c: [coord.domainAngle, coord.layerRadius, coord.phase, coord.concentration],
    k: claim.authority || source,
    st: claim.status || 'unknown',
    r: claim.risk || 'medium',
    src: source,
    h: sha256(`${id}\n${text}`).slice(0, 16),
    tc: Math.max(1, Math.ceil(Number(claim.tokenCost) || text.length / 4)),
    p: claim.hydrate || claim.path || claim.evidence_path || claim.file || null,
    ...trustFieldsFrom(claim)
  };
}

export function buildWikiCoordinateIndex({ mission = {}, claims = [], q4 = {}, q3 = [], maxAnchors = 24, pinAnchorIds = [] }: any = {}) {
  const missionCoord = normalizeWikiCoord(mission.coord || {}, mission.id || JSON.stringify(q3 || []));
  const claimsById = new Map((claims || []).map((claim: any, index: any) => [String(claim.id || `claim-${index + 1}`), claim]));
  const limit = Math.max(0, Number(maxAnchors) || 0);
  const pinned = new Set((pinAnchorIds || []).map((id: any) => String(id)).filter(Boolean));
  const compareAnchor = (a: any, b: any) => b.pri - a.pri || b.sim - a.sim || a.id.localeCompare(b.id);
  const candidates = (claims || [])
    .map((claim: any, index: any) => {
      const anchor = wikiAnchorFromClaim(claim, index);
      const coord = { domainAngle: anchor.c[0], layerRadius: anchor.c[1], phase: anchor.c[2], concentration: anchor.c[3] };
      const required = clamp01(Number(claim.required_weight || 0) / 1.5);
      const trust = Number.isFinite(Number(claim.trust_score)) ? clamp01(Number(claim.trust_score)) : statusScore(claim.status);
      const risk = riskScore(claim.risk);
      return { ...anchor, sim: round6(wikiCoordSimilarity(missionCoord, coord)), pri: round4((required * 0.52) + (trust * 0.3) + (risk * 0.18)) };
    })
    .sort(compareAnchor);
  const pinnedAnchors = candidates.filter((anchor: any) => pinned.has(anchor.id)).sort(compareAnchor).slice(0, limit);
  const pinnedAnchorIds = new Set(pinnedAnchors.map((anchor: any) => anchor.id));
  const anchors = [
    ...pinnedAnchors,
    ...candidates.filter((anchor: any) => !pinnedAnchorIds.has(anchor.id)).slice(0, Math.max(0, limit - pinnedAnchors.length))
  ];
  return {
    schema: WIKI_COORD_SCHEMA,
    channel_map: {
      r: 'domainAngle',
      g: 'layerRadius',
      b: 'phase',
      a: 'concentration'
    },
    transform: 'domain=2pi*r/256; layer=sin(g*pi/512); phase=2pi*b/256; xyzw=[a*cos(domain),a*sin(domain),layer*cos(phase),layer*sin(phase)]',
    mission: {
      id: mission.id || 'mission',
      rgba: rgbaKey(missionCoord.rgba),
      c: [missionCoord.domainAngle, missionCoord.layerRadius, missionCoord.phase, missionCoord.concentration]
    },
    q4_hash: sha256(JSON.stringify(q4 || {})).slice(0, 16),
    q3,
    anchors,
    overflow_count: Math.max(0, (claims || []).length - anchors.length),
    vx: buildWikiVoxelOverlay({ anchors, claimsById, q3 }),
    hydration_policy: 'anchor_ids_hashes_and_paths_keep_context_hydratable_without_pasting_raw_q0'
  };
}

export function compactWikiCoordinateIndex(index: any = {}) {
  return {
    schema: WIKI_COORD_SCHEMA,
    ch: 'r=domain,g=sin-layer,b=phase,a=concentration',
    m: [index.mission?.rgba || '000000ff', index.mission?.c || [0, 0, 0, 1]],
    q: index.q4_hash || null,
    q3: index.q3 || [],
    a: (index.anchors || []).map((anchor: any) => appendTrustSlots([
      anchor.id,
      anchor.rgba,
      anchor.c,
      anchor.k,
      anchor.st,
      anchor.r,
      anchor.src,
      anchor.h,
      anchor.p
    ], anchor)),
    o: index.overflow_count || 0,
    vx: index.vx,
    hp: 'id+rgba+coord+source+hash hydrate Q2/Q1/Q0 on demand'
  };
}

function statusScore(status: any) {
  const table: Record<string, number> = {
    supported: 1,
    weak: 0.62,
    stale: 0.35,
    unknown: 0.32,
    unsupported: 0.06,
    conflicted: 0,
  };
  return table[String(status || 'unknown')] ?? 0.32;
}

function freshnessScore(value: any) {
  const table: Record<string, number> = {
    fresh: 1,
    unknown: 0.55,
    stale: 0.18,
  };
  return table[String(value || 'unknown')] ?? 0.55;
}

function riskScore(value: any) {
  const table: Record<string, number> = {
    low: 0.12,
    medium: 0.35,
    high: 0.74,
    critical: 1,
  };
  return table[String(value || 'medium')] ?? 0.35;
}

function normalizeVoxelQuantization(value: any = {}) {
  const normalize = (key: 'domain' | 'radius' | 'phase') => {
    const candidate = Number(value?.[key]);
    return Number.isInteger(candidate) && candidate > 0 && candidate <= 65_536
      ? candidate
      : DEFAULT_WIKI_VOXEL_QUANTIZATION[key];
  };
  return { domain: normalize('domain'), radius: normalize('radius'), phase: normalize('phase') };
}

function quantizeVoxelCoord(c: any = [], value: any = DEFAULT_WIKI_VOXEL_QUANTIZATION) {
  const quantization = normalizeVoxelQuantization(value);
  const domain = Math.max(0, Math.min(quantization.domain - 1, Math.floor((wrapTau(c[0]) / WIKI_TAU) * quantization.domain)));
  const radius = Math.max(0, Math.min(quantization.radius - 1, Math.floor(clamp01(Number(c[1])) * quantization.radius)));
  const phase = Math.max(0, Math.min(quantization.phase - 1, Math.floor((wrapTau(c[2]) / WIKI_TAU) * quantization.phase)));
  return `${domain}:${radius}:${phase}`;
}

function conflictShadow(anchor: any = {}, claim: any = {}) {
  const status = claim.status || anchor.st || 'unknown';
  if (status === 'conflicted') return 1;
  if (status === 'unsupported') return riskScore(claim.risk || anchor.r);
  if (status === 'stale') return 0.6;
  return 0;
}

function layerVector(anchor: any = {}, claim: any = {}, q3: any = []) {
  const tokenCost = Math.max(1, Number(anchor.tc) || String(claim.text || '').length / 4 || 1);
  const required = Math.max(0, Number(claim.required_weight) || 0);
  const requestCount = Math.max(0, Number(claim.request_count) || 0);
  const strongFeedback = Math.max(0, Number(claim.strong_feedback_count) || 0);
  const route = `${anchor.id || ''} ${anchor.src || ''} ${claim.text || ''} ${(q3 || []).join(' ')}`.toLowerCase();
  const trust = Number.isFinite(Number(anchor.trust_score))
    ? Number(anchor.trust_score)
    : clamp01((0.7 * statusScore(claim.status || anchor.st)) + (0.3 * Math.log1p(Number(claim.evidence_count) || 0) / Math.log1p(8)));
  const concentration = Number(anchor.c?.[3]);
  const similarity = Number(anchor.sim);
  return [
    clamp01((Number.isFinite(concentration) ? concentration : 0.85) * (Number.isFinite(similarity) ? similarity : 1)),
    clamp01(trust),
    freshnessScore(claim.freshness),
    clamp01((required / 1.25) + (requestCount * 0.04) + (strongFeedback * 0.18)),
    conflictShadow(anchor, claim),
    clamp01((/wiki|memory|triwiki/.test(route) ? 0.45 : 0) + (/naruto|subagent/.test(route) ? 0.25 : 0) + (/qa|test|gx|version|setup|npm/.test(route) ? 0.2 : 0)),
    clamp01(tokenCost / 360)
  ].map(round4);
}

export function buildWikiVoxelOverlay({ anchors = [], claimsById = new Map(), q3 = [], quantization = DEFAULT_WIKI_VOXEL_QUANTIZATION }: any = {}) {
  const normalizedQuantization = normalizeVoxelQuantization(quantization);
  const rows = (anchors || []).map((anchor: any) => {
    const claim = claimsById instanceof Map ? claimsById.get(anchor.id) || {} : {};
    return [quantizeVoxelCoord(anchor.c, normalizedQuantization), anchor.id, layerVector(anchor, claim, q3)];
  });
  return {
    s: WIKI_VOXEL_SCHEMA,
    base: WIKI_COORD_SCHEMA,
    q: normalizedQuantization,
    l: WIKI_VOXEL_LAYERS,
    v: rows
  };
}

export function validateWikiVoxelOverlay(overlay: any = {}, anchorIds: any = null) {
  const issues: any[] = [];
  if (!overlay) return { ok: true, checked: 0, issues };
  if (overlay.s !== WIKI_VOXEL_SCHEMA) issues.push({ id: 'vx_schema', severity: 'error' });
  if (overlay.base !== WIKI_COORD_SCHEMA) issues.push({ id: 'vx_base', severity: 'error' });
  if (!Array.isArray(overlay.l) || overlay.l.join('|') !== WIKI_VOXEL_LAYERS.join('|')) issues.push({ id: 'vx_layers', severity: 'error' });
  const rawQuantization = overlay.q;
  for (const key of ['domain', 'radius', 'phase']) {
    const value = Number(rawQuantization?.[key]);
    if (!Number.isInteger(value) || value <= 0 || value > 65_536) issues.push({ id: 'vx_quantization', severity: 'error', axis: key });
  }
  const quantization = normalizeVoxelQuantization(rawQuantization);
  const expectedById = new Map<string, string | null>();
  if (anchorIds instanceof Map) {
    for (const [id, value] of anchorIds) {
      const coord = Array.isArray(value) ? value : value?.c;
      expectedById.set(String(id), Array.isArray(coord) && coord.length === 4 ? quantizeVoxelCoord(coord, quantization) : null);
    }
  } else if (anchorIds instanceof Set) {
    for (const id of anchorIds) expectedById.set(String(id), null);
  }
  const rows = Array.isArray(overlay.v) ? overlay.v : [];
  const seenIds = new Set<string>();
  for (const row of rows) {
    const id = row[1];
    const values = row[2];
    const key = String(row[0] || '');
    const parts = /^\d+:\d+:\d+$/.test(key) ? key.split(':').map(Number) : [];
    const [domainKey = -1, radiusKey = -1, phaseKey = -1] = parts;
    if (parts.length !== 3
      || domainKey < 0 || domainKey >= quantization.domain
      || radiusKey < 0 || radiusKey >= quantization.radius
      || phaseKey < 0 || phaseKey >= quantization.phase) issues.push({ id: 'vx_key', severity: 'error', anchor: id });
    if (!id) issues.push({ id: 'vx_id', severity: 'error' });
    if (id && seenIds.has(String(id))) issues.push({ id: 'vx_duplicate_anchor', severity: 'error', anchor: id });
    if (id) seenIds.add(String(id));
    if (anchorIds && !expectedById.has(String(id))) issues.push({ id: 'vx_anchor', severity: 'error', anchor: id });
    const expectedKey = expectedById.get(String(id));
    if (expectedKey && key !== expectedKey) issues.push({ id: 'vx_coord_mismatch', severity: 'error', anchor: id });
    if (!Array.isArray(values) || values.length !== WIKI_VOXEL_LAYERS.length) issues.push({ id: 'vx_tuple', severity: 'error', anchor: id });
    else {
      for (const value of values) {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0 || n > 1) issues.push({ id: 'vx_value', severity: 'error', anchor: id });
      }
    }
  }
  for (const id of expectedById.keys()) {
    if (!seenIds.has(id)) issues.push({ id: 'vx_missing_anchor', severity: 'error', anchor: id });
  }
  return { ok: issues.length === 0, checked: rows.length, issues };
}

function expandedAnchors(index: any = {}) {
  if (Array.isArray(index.anchors)) return index.anchors;
  if (!Array.isArray(index.a)) return [];
  return index.a.map((row: any) => {
    const anchor: Record<string, unknown> = {
      id: row[0],
      rgba: row[1],
      c: row[2],
      k: row[3],
      st: row[4],
      r: row[5],
      src: row[6],
      h: row[7],
      p: row[8],
    };
    if (row.length > 9 && row[9] != null) anchor.trust_score = row[9];
    if (row.length > 10 && row[10] != null) anchor.trust_band = row[10];
    return anchor;
  });
}

function validateTrustFields(anchor: any = {}, issues: any = []) {
  if (hasOwn(anchor, 'trust_score')) {
    const score = Number(anchor.trust_score);
    if (!Number.isFinite(score) || score < 0 || score > 1) {
      issues.push({ id: 'invalid_trust_score', severity: 'error', anchor: anchor.id });
    }
  }
  if (hasOwn(anchor, 'trust_band') && (typeof anchor.trust_band !== 'string' || !anchor.trust_band.trim())) {
    issues.push({ id: 'invalid_trust_band', severity: 'error', anchor: anchor.id });
  }
  if (hasOwn(anchor, 'trust_action') && (typeof anchor.trust_action !== 'string' || !anchor.trust_action.trim())) {
    issues.push({ id: 'invalid_trust_action', severity: 'error', anchor: anchor.id });
  }
}

function pathIsInsideRoot(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

interface HydrationValidationRoot {
  resolved: string;
  real: string | null;
  cache: Map<string, string | null>;
}

function hydrationValidationRoot(root: unknown): HydrationValidationRoot | null {
  if (!root) return null;
  const resolved = path.resolve(String(root));
  try {
    return { resolved, real: fs.realpathSync(resolved), cache: new Map() };
  } catch {
    return { resolved, real: null, cache: new Map() };
  }
}

function validateHydrationPath(anchor: any = {}, root: HydrationValidationRoot | null, issues: any[] = []) {
  if (!root || !hasOwn(anchor, 'p') || anchor.p == null) return;
  if (typeof anchor.p !== 'string' || !anchor.p.trim()) {
    issues.push({ id: 'invalid_hydration_path', severity: 'error', anchor: anchor.id, path: anchor.p });
    return;
  }
  const citation = anchor.p.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(citation)) return;
  const resolvedCitation = path.isAbsolute(citation) ? path.resolve(citation) : path.resolve(root.resolved, citation);
  if (!pathIsInsideRoot(root.resolved, resolvedCitation)) {
    issues.push({ id: 'hydration_path_outside_root', severity: 'error', anchor: anchor.id, path: citation });
    return;
  }
  let realCitation = root.cache.get(resolvedCitation) || null;
  if (!root.cache.has(resolvedCitation)) {
    try {
      realCitation = fs.realpathSync(resolvedCitation);
    } catch {
      realCitation = null;
    }
    root.cache.set(resolvedCitation, realCitation);
  }
  if (!realCitation) {
    issues.push({ id: 'hydration_path_missing', severity: 'error', anchor: anchor.id, path: citation });
    return;
  }
  if (!root.real || !pathIsInsideRoot(root.real, realCitation)) {
    issues.push({ id: 'hydration_path_outside_root', severity: 'error', anchor: anchor.id, path: citation });
  }
}

export function validateWikiCoordinateIndex(index: any = {}, options: { root?: string | null; claims?: any[] | null } = {}) {
  const issues: any[] = [];
  if (index.schema !== WIKI_COORD_SCHEMA) issues.push({ id: 'schema_mismatch', severity: 'error' });
  if (!index.channel_map && !index.ch) issues.push({ id: 'channel_map_missing', severity: 'error' });
  const anchors = expandedAnchors(index);
  if (!anchors.length && !Array.isArray(index.anchors) && !Array.isArray(index.a)) issues.push({ id: 'anchors_missing', severity: 'error' });
  const seen = new Set();
  const hydrationRoot = hydrationValidationRoot(options.root);
  const compactClaims = new Map(
    (Array.isArray(options.claims) ? options.claims : [])
      .filter((claim: any) => claim && typeof claim.id === 'string')
      .map((claim: any) => [String(claim.id), claim])
  );
  for (const anchor of anchors) {
    if (!anchor.id) issues.push({ id: 'anchor_id_missing', severity: 'error' });
    if (seen.has(anchor.id)) issues.push({ id: 'duplicate_anchor', severity: 'error', anchor: anchor.id });
    seen.add(anchor.id);
    if (!/^[0-9a-f]{8}$/i.test(String(anchor.rgba || ''))) issues.push({ id: 'invalid_rgba_key', severity: 'error', anchor: anchor.id });
    if (!Array.isArray(anchor.c) || anchor.c.length !== 4) issues.push({ id: 'invalid_coord_tuple', severity: 'error', anchor: anchor.id });
    if (!/^[0-9a-f]{16}$/i.test(String(anchor.h || ''))) issues.push({ id: 'invalid_anchor_hash', severity: 'error', anchor: anchor.id });
    const compactClaim: any = compactClaims.get(String(anchor.id));
    if (compactClaim && typeof compactClaim.text === 'string') {
      const expectedHash = sha256(`${anchor.id}\n${compactClaim.text}`).slice(0, 16);
      if (anchor.h !== expectedHash) issues.push({ id: 'anchor_hash_mismatch', severity: 'error', anchor: anchor.id });
      if (compactClaim.h !== expectedHash) issues.push({ id: 'compact_claim_hash_mismatch', severity: 'error', anchor: anchor.id });
    }
    validateTrustFields(anchor, issues);
    validateHydrationPath(anchor, hydrationRoot, issues);
  }
  const voxel = index.vx || index.voxel_overlay;
  if (!voxel) issues.push({ id: 'vx_missing', severity: 'error' });
  else {
    const anchorMap = new Map(anchors.map((anchor: any) => [String(anchor.id), anchor]));
    const voxelValidation = validateWikiVoxelOverlay(voxel, anchorMap);
    for (const issue of voxelValidation.issues) issues.push(issue);
  }
  return { ok: issues.length === 0, checked: anchors.length, issues };
}
