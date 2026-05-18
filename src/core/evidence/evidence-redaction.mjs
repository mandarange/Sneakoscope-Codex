import { containsPlaintextSecret, redactSecrets } from '../secret-redaction.mjs';

export function redactEvidence(value) {
  return redactSecrets(value);
}

export function evidenceHasPlaintextSecret(value) {
  return containsPlaintextSecret(value);
}
