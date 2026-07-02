import assert from 'node:assert/strict';
import { paginate } from './src/pagination.js';

assert.deepEqual(paginate([1, 2, 3, 4, 5], 3, 2), [5]);
assert.deepEqual(paginate([1, 2, 3, 4], 2, 2), [3, 4]);
