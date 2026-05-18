import { nowIso, randomId } from '../fsx.mjs';

export const EVIDENCE_SCHEMA = 'sks.evidence.v1';
export const EVIDENCE_INDEX_SCHEMA = 'sks.evidence-index.v1';
export const PROJECT_EVIDENCE_INDEX_SCHEMA = 'sks.project-evidence-index.v1';

export const EVIDENCE_KINDS = Object.freeze([
  'scout',
  'image_voxel',
  'db_safety',
  'hook',
  'codex_lb',
  'test',
  'file_change',
  'command',
  'rust',
  'blackbox',
  'proof',
  'route_contract',
  'trust_report',
  'route_gate',
  'artifact'
]);

export const EVIDENCE_SOURCES = Object.freeze([
  'real',
  'mock',
  'static_contract',
  'fixture',
  'blocked'
]);

export const EVIDENCE_FRESHNESS = Object.freeze([
  'fresh',
  'stale',
  'unknown'
]);

export const EVIDENCE_TRUST = Object.freeze([
  'high',
  'medium',
  'low',
  'blocked'
]);

export function evidenceId(kind = 'artifact') {
  return `EV-${String(kind || 'artifact').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase() || 'ART'}-${randomId(8)}`;
}

export function normalizeEvidenceKind(kind = 'artifact') {
  return EVIDENCE_KINDS.includes(kind) ? kind : 'artifact';
}

export function normalizeEvidenceSource(source = 'real') {
  return EVIDENCE_SOURCES.includes(source) ? source : 'real';
}

export function normalizeEvidenceFreshness(freshness = 'unknown') {
  return EVIDENCE_FRESHNESS.includes(freshness) ? freshness : 'unknown';
}

export function normalizeEvidenceTrust(trust = 'low') {
  return EVIDENCE_TRUST.includes(trust) ? trust : 'low';
}

export function createEvidenceRecord(input = {}) {
  const source = normalizeEvidenceSource(input.source);
  const freshness = normalizeEvidenceFreshness(input.freshness);
  return {
    schema: EVIDENCE_SCHEMA,
    id: input.id || evidenceId(input.kind),
    mission_id: input.mission_id || null,
    kind: normalizeEvidenceKind(input.kind),
    source,
    path: input.path || null,
    sha256: input.sha256 || null,
    created_at: input.created_at || nowIso(),
    freshness,
    trust: normalizeEvidenceTrust(input.trust || trustForEvidence({ source, freshness, blocked: input.blocked })),
    redacted: input.redacted !== false,
    issues: Array.isArray(input.issues) ? input.issues : []
  };
}

export function trustForEvidence({ source = 'real', freshness = 'unknown', blocked = false } = {}) {
  if (blocked || source === 'blocked') return 'blocked';
  if (freshness === 'stale') return 'blocked';
  if (source === 'mock' || source === 'static_contract') return 'low';
  if (source === 'fixture') return 'medium';
  return freshness === 'fresh' ? 'high' : 'medium';
}

export function validateEvidenceRecord(record = {}) {
  const issues = [];
  if (record.schema !== EVIDENCE_SCHEMA) issues.push('schema');
  if (!record.id) issues.push('id');
  if (!EVIDENCE_KINDS.includes(record.kind)) issues.push('kind');
  if (!EVIDENCE_SOURCES.includes(record.source)) issues.push('source');
  if (!EVIDENCE_FRESHNESS.includes(record.freshness)) issues.push('freshness');
  if (!EVIDENCE_TRUST.includes(record.trust)) issues.push('trust');
  if (record.path && !record.sha256) issues.push('sha256');
  if ((record.source === 'mock' || record.source === 'static_contract') && record.trust === 'high') issues.push('mock_high_trust');
  if (record.freshness === 'stale' && record.trust !== 'blocked') issues.push('stale_not_blocked');
  return { ok: issues.length === 0, issues };
}
