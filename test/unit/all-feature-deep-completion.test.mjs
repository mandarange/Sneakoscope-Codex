import test from 'node:test';
import { packageScriptIncludes, sourceIncludes } from '../helpers/real-execution-closure.mjs';

test('all-feature completion checks deep coverage dimensions', () => {
  packageScriptIncludes('all-features:deep-completion', 'all-feature-deep-completion-check.mjs');
  sourceIncludes('src/core/feature-registry.ts', ['command_registry', 'completion_proof', 'trust_report', 'wrongness', 'blackbox']);
});
