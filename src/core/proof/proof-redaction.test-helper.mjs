import { containsPlaintextSecret, redactSecrets } from '../secret-redaction.mjs';

export function assertProofRedaction(value) {
  const redacted = redactSecrets(value);
  return {
    ok: !containsPlaintextSecret(redacted),
    redacted
  };
}
