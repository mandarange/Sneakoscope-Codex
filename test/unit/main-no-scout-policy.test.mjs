import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMainScoutCall } from '../../dist/core/agents/scout-policy.js';

test('blocks main Scout calls while allowing native agent orchestration text', () => {
  assert.equal(detectMainScoutCall('spawn native multi-session agents').ok, true);
  assert.equal(detectMainScoutCall('main orchestrator runs sks scouts run').ok, false);
});
