import test from 'node:test';
import assert from 'node:assert/strict';
import { CORE_BENCH_BUDGETS } from '../../src/core/bench.mjs';

test('core dominance performance budgets expose trust hot paths', () => {
  assert.equal(CORE_BENCH_BUDGETS['sks --version'], 50);
  assert.equal(CORE_BENCH_BUDGETS['sks proof validate --json'], 250);
  assert.equal(CORE_BENCH_BUDGETS['sks trust validate latest --json'], 300);
  assert.equal(CORE_BENCH_BUDGETS['sks features check --json'], 1200);
});
