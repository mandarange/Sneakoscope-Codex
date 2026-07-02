import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { countPairs } from './src/pairs.js';

assert.equal(countPairs([1, 2, 3, 4], 5), 2);
const values = Array.from({ length: 6000 }, (_, index) => index % 200);
const started = performance.now();
const count = countPairs(values, 199);
const elapsed = performance.now() - started;
assert.equal(count, 90000);
assert.ok(elapsed < 250, `too slow: ${elapsed}ms`);
