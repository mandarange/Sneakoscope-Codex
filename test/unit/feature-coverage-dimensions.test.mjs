import test from 'node:test';
import { sourceIncludes } from '../helpers/real-execution-closure.mjs';

test('feature completion rows include recovery, mock/real, redaction, and performance dimensions', () => {
  sourceIncludes('src/core/feature-registry.ts', ['mock_not_real', 'unavailable_blocker', 'redaction', 'perf_budget', 'json_recovery']);
});
