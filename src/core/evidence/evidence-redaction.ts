import { containsPlaintextSecret, redactSecrets } from '../secret-redaction.js';

export function redactEvidence(value: any) {
  return redactSecrets(value);
}

export function evidenceHasPlaintextSecret(value: any) {
  return containsPlaintextSecret(value);
}
