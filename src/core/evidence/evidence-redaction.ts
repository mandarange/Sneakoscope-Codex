// @ts-nocheck
import { containsPlaintextSecret, redactSecrets } from '../secret-redaction.js';

export function redactEvidence(value) {
  return redactSecrets(value);
}

export function evidenceHasPlaintextSecret(value) {
  return containsPlaintextSecret(value);
}
