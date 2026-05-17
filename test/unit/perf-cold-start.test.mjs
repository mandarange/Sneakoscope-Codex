import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_COLD_START_ITERATIONS, resolveColdStartIterations } from '../../src/commands/perf.mjs';

test('cold-start perf gate defaults to enough samples that p95 is not the max of ten', () => {
  assert.equal(DEFAULT_COLD_START_ITERATIONS, 20);
  assert.equal(resolveColdStartIterations(undefined), 20);
  assert.equal(resolveColdStartIterations(''), 20);
  assert.equal(resolveColdStartIterations('7'), 7);
});
