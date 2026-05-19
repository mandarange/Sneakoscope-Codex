import { containsPlaintextSecret, redactSecrets } from '../secret-redaction.js';

export function assertProofRedaction(value: any) {
  const redacted = redactSecrets(value);
  return {
    ok: !containsPlaintextSecret(redacted),
    redacted
  };
}
