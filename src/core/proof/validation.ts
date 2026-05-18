import { COMPLETION_PROOF_SCHEMA, type CompletionProof, isCompletionProof } from './proof-schema.js';

export interface ValidationResult {
  ok: boolean;
  status: CompletionProof['status'];
  issues: string[];
}

export function validateCompletionProof(value: unknown): ValidationResult {
  const issues: string[] = [];
  if (!isCompletionProof(value)) {
    return { ok: false, status: 'failed', issues: ['completion_proof_shape'] };
  }
  if (value.schema !== COMPLETION_PROOF_SCHEMA) issues.push('schema');
  if (value.status === 'failed') issues.push('proof_failed');
  if (value.status === 'verified' && value.unverified.length > 0) issues.push('verified_with_unverified_claims');
  if (value.status === 'verified' && value.blockers.length > 0) issues.push('verified_with_blockers');
  return { ok: issues.length === 0, status: issues.length ? 'failed' : value.status, issues };
}
