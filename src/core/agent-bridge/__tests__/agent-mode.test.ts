import test from 'node:test';
import assert from 'node:assert/strict';
import { agentModeActive, AGENT_MODE_ENV_PASSTHROUGH } from '../agent-mode.js';

test('agentModeActive is true only when SKS_AGENT_MODE is exactly "1"', () => {
  assert.equal(agentModeActive({}), false);
  assert.equal(agentModeActive({ SKS_AGENT_MODE: '0' }), false);
  assert.equal(agentModeActive({ SKS_AGENT_MODE: 'true' }), false);
  assert.equal(agentModeActive({ SKS_AGENT_MODE: 'yes' }), false);
  assert.equal(agentModeActive({ SKS_AGENT_MODE: ' 1' }), false);
  assert.equal(agentModeActive({ SKS_AGENT_MODE: '1' }), true);
});

test('AGENT_MODE_ENV_PASSTHROUGH documents existing gate-skipping env var names', () => {
  assert.equal(Array.isArray(AGENT_MODE_ENV_PASSTHROUGH), true);
  assert.equal(AGENT_MODE_ENV_PASSTHROUGH.includes('SKS_UPDATE_MIGRATION_GATE_DISABLED'), true);
  assert.equal(AGENT_MODE_ENV_PASSTHROUGH.includes('SKS_DISABLE_UPDATE_CHECK'), true);
});
