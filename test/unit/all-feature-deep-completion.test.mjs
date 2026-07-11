import test from 'node:test';
import { releaseGateIncludes, sourceIncludes } from '../helpers/real-execution-closure.mjs';

test('all-feature completion checks deep coverage dimensions', () => {
  releaseGateIncludes('all-features:deep-completion', 'all-feature-deep-completion-check.js');
  sourceIncludes('src/core/feature-registry.ts', ['command_registry', 'completion_proof', 'trust_report', 'wrongness', 'blackbox']);
});
