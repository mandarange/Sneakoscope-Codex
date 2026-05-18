import { type TrustStatus } from './trust-kernel-schema.js';

const ORDER: readonly TrustStatus[] = ['failed', 'blocked', 'not_verified', 'verified_partial', 'verified'];

export function combineTrustStatus(values: readonly TrustStatus[]): TrustStatus {
  for (const candidate of ORDER) {
    if (values.includes(candidate)) return candidate;
  }
  return 'not_verified';
}
