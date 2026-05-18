import { isEvidenceRecord, type EvidenceIndex, type EvidenceRecord, EVIDENCE_INDEX_SCHEMA } from '../evidence/evidence-schema.js';
import { ValidationError } from './validation-error.js';

export function parseEvidenceRecord(value: unknown): EvidenceRecord {
  if (!isEvidenceRecord(value)) throw new ValidationError('sks.evidence.v1');
  return value;
}

export function parseEvidenceIndex(value: unknown): EvidenceIndex {
  if (!value || typeof value !== 'object') throw new ValidationError(EVIDENCE_INDEX_SCHEMA);
  const index = value as Partial<EvidenceIndex>;
  if (index.schema !== EVIDENCE_INDEX_SCHEMA || !Array.isArray(index.records) || !Array.isArray(index.issues)) {
    throw new ValidationError(EVIDENCE_INDEX_SCHEMA);
  }
  for (const record of index.records) parseEvidenceRecord(record);
  return index as EvidenceIndex;
}
