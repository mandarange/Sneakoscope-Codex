import test from 'node:test';
import assert from 'node:assert/strict';
import { computerUseLiveSmoke } from '../../dist/core/computer-use-status.js';

test('Computer Use smoke is optional by default and structured when real capability is unavailable', async () => {
  const result = await computerUseLiveSmoke({ forceMacos: false });
  assert.equal(result.schema, 'sks.computer-use-live-smoke.v2');
  assert.equal(result.evidence_mode, 'probe_only');
  assert.equal(result.ok, true);
  assert.equal(result.mock, false);
});
