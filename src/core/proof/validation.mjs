import { containsPlaintextSecret } from '../secret-redaction.mjs';
import { COMPLETION_PROOF_SCHEMA, COMPLETION_PROOF_STATUSES } from './proof-schema.mjs';

export function validateCompletionProof(proof = {}) {
  const issues = [];
  if (proof.schema !== COMPLETION_PROOF_SCHEMA) issues.push('schema');
  if (!COMPLETION_PROOF_STATUSES.includes(proof.status)) issues.push('status');
  if (!proof.summary || typeof proof.summary !== 'object') issues.push('summary');
  if (!proof.evidence || typeof proof.evidence !== 'object') issues.push('evidence');
  if (!Array.isArray(proof.claims)) issues.push('claims');
  if (!Array.isArray(proof.unverified)) issues.push('unverified');
  if (!Array.isArray(proof.blockers)) issues.push('blockers');
  if (containsPlaintextSecret(proof)) issues.push('plaintext_secret');
  return {
    ok: issues.length === 0,
    status: issues.length ? 'failed' : proof.status,
    issues
  };
}
