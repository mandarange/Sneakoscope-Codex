import assert from 'node:assert/strict';
import { parsePort } from './src/config.js';

assert.equal(parsePort('0'), 0);
assert.equal(parsePort('8080'), 8080);
assert.equal(parsePort(''), 3000);
