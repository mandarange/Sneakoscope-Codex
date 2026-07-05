import test from 'node:test';
import assert from 'node:assert/strict';
import { agentModeActive, interactiveInputRequiredResponse, AGENT_MODE_ENV_PASSTHROUGH } from '../agent-mode.js';

test('agentModeActive is true only when SKS_AGENT_MODE is exactly "1"', () => {
  assert.equal(agentModeActive({}), false);
  assert.equal(agentModeActive({ SKS_AGENT_MODE: '0' }), false);
  assert.equal(agentModeActive({ SKS_AGENT_MODE: 'true' }), false);
  assert.equal(agentModeActive({ SKS_AGENT_MODE: 'yes' }), false);
  assert.equal(agentModeActive({ SKS_AGENT_MODE: ' 1' }), false);
  assert.equal(agentModeActive({ SKS_AGENT_MODE: '1' }), true);
});

test('interactiveInputRequiredResponse returns the exact expected shape', () => {
  const response = interactiveInputRequiredResponse('Continue? (y/n)', 'pass --yes to skip this prompt');
  assert.deepEqual(response, {
    ok: false,
    error: 'interactive_input_required',
    question: 'Continue? (y/n)',
    non_interactive_hint: 'pass --yes to skip this prompt'
  });
});

test('AGENT_MODE_ENV_PASSTHROUGH documents existing gate-skipping env var names', () => {
  assert.equal(Array.isArray(AGENT_MODE_ENV_PASSTHROUGH), true);
  assert.equal(AGENT_MODE_ENV_PASSTHROUGH.includes('SKS_UPDATE_MIGRATION_GATE_DISABLED'), true);
  assert.equal(AGENT_MODE_ENV_PASSTHROUGH.includes('SKS_DISABLE_UPDATE_CHECK'), true);
});
