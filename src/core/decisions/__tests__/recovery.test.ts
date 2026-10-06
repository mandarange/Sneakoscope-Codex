import test from 'node:test';
import assert from 'node:assert/strict';
import { listProductionRecoveryCandidates, RECOVERY_CAPABILITY } from '../recovery.js';

test('production recovery remains unsupported and lists no live handlers', () => {
  assert.equal(RECOVERY_CAPABILITY.supported, false);
  assert.deepEqual(listProductionRecoveryCandidates(), []);
});
