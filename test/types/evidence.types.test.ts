import {
  EVIDENCE_INDEX_SCHEMA,
  EVIDENCE_SCHEMA,
  isEvidenceRecord,
  type EvidenceIndex,
  type EvidenceRecord
} from '../../src/core/evidence/evidence-schema.js';

const record: EvidenceRecord = {
  schema: EVIDENCE_SCHEMA,
  id: 'evidence-001',
  mission_id: null,
  kind: 'command',
  source: 'real',
  path: null,
  sha256: null,
  freshness: 'fresh',
  trust: 'high',
  redacted: false,
  issues: []
};

const index: EvidenceIndex = {
  schema: EVIDENCE_INDEX_SCHEMA,
  generated_at: '2026-05-18T00:00:00.000Z',
  mission_id: null,
  route: '$Naruto',
  status: 'verified_partial',
  ok: true,
  records: [record],
  issues: []
};

const guardResult: boolean = isEvidenceRecord(record);

void index;
void guardResult;
