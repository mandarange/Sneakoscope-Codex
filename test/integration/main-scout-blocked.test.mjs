import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMainScoutCall } from '../../dist/core/agents/scout-policy.js';

test('main Scout command text blocks policy proof', () => {
  const decision = detectMainScoutCall('Team main route executes sks scouts run before agents');
  assert.equal(decision.ok, false);
});
