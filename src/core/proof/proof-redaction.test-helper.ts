// @ts-nocheck
import { containsPlaintextSecret, redactSecrets } from '../secret-redaction.js';

export function assertProofRedaction(value) {
  const redacted = redactSecrets(value);
  return {
    ok: !containsPlaintextSecret(redacted),
    redacted
  };
}
