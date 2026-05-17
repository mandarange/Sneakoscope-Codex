import { availableEngine } from './scout-engine-base.mjs';

export function localStaticEngineDescriptor() {
  return availableEngine('local-static', {
    real_parallel: false,
    claim_allowed: false,
    fallback_only: true,
    reason: 'Local deterministic static scout fixture engine. It is useful for tests but cannot support real speedup claims.'
  });
}
