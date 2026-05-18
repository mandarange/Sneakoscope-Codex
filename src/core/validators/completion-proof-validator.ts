import { isCompletionProof, type CompletionProof } from '../proof/proof-schema.js';
import { ValidationError } from './validation-error.js';

export function parseCompletionProof(value: unknown): CompletionProof {
  if (!isCompletionProof(value)) throw new ValidationError('sks.completion-proof.v1');
  return value;
}
