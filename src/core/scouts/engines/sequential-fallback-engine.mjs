import { availableEngine } from './scout-engine-base.mjs';

export function sequentialFallbackEngineDescriptor() {
  return availableEngine('sequential-fallback', {
    real_parallel: false,
    claim_allowed: false,
    fallback_only: true,
    reason: 'Sequential deterministic fallback. It is honest fallback evidence only.'
  });
}
