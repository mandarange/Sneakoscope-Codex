import { type TrustStatus } from '../trust-kernel/trust-kernel-schema.js';

export const EVIDENCE_SCHEMA = 'sks.evidence.v1' as const;
export const EVIDENCE_INDEX_SCHEMA = 'sks.evidence-index.v1' as const;

export type EvidenceKind =
  | 'scout'
  | 'image_voxel'
  | 'db_safety'
  | 'hook'
  | 'codex_lb'
  | 'test'
  | 'file_change'
  | 'command'
  | 'rust'
  | 'blackbox'
  | 'proof'
  | 'route_contract'
  | 'trust_report'
  | 'route_gate'
  | 'artifact';

export type EvidenceSource = 'real' | 'mock' | 'static_contract' | 'fixture' | 'blocked';
export type EvidenceFreshness = 'fresh' | 'stale' | 'unknown';
export type EvidenceTrust = 'high' | 'medium' | 'low' | 'blocked';

export interface EvidenceRecord {
  schema: typeof EVIDENCE_SCHEMA;
  id: string;
  mission_id: string | null;
  kind: EvidenceKind;
  source: EvidenceSource;
  path: string | null;
  sha256: string | null;
  freshness: EvidenceFreshness;
  trust: EvidenceTrust;
  redacted: boolean;
  issues: string[];
}

export interface EvidenceIndex {
  schema: typeof EVIDENCE_INDEX_SCHEMA;
  generated_at: string;
  mission_id: string | null;
  route: string | null;
  status: TrustStatus;
  ok: boolean;
  records: EvidenceRecord[];
  issues: string[];
}

export function isEvidenceRecord(value: unknown): value is EvidenceRecord {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<EvidenceRecord>;
  return row.schema === EVIDENCE_SCHEMA
    && typeof row.id === 'string'
    && typeof row.kind === 'string'
    && typeof row.source === 'string'
    && (row.path === null || typeof row.path === 'string')
    && (row.sha256 === null || typeof row.sha256 === 'string')
    && Array.isArray(row.issues);
}
