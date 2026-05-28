import test from 'node:test';
import assert from 'node:assert/strict';
import { agentWorkerEnv } from '../../dist/core/agents/agent-worker-pipeline.js';

test('agent worker env propagates fast mode by default', () => {
  const env = agentWorkerEnv({ id: 'agent_1', session_id: 'session_1', slot_id: 'slot-1' }, 'allowed.json');
  assert.equal(env.SKS_AGENT_WORKER, '1');
  assert.equal(env.SKS_PIPELINE_MODE, 'agent-worker');
  assert.equal(env.SKS_DISABLE_ROUTE_RECURSION, '1');
  assert.equal(env.SKS_FAST_MODE, '1');
  assert.equal(env.SKS_SERVICE_TIER, 'fast');
});

test('agent worker env preserves standard-tier opt-out', () => {
  const env = agentWorkerEnv({
    id: 'agent_1',
    session_id: 'session_1',
    slot_id: 'slot-1',
    fast_mode: false,
    service_tier: 'standard'
  }, 'allowed.json');
  assert.equal(env.SKS_FAST_MODE, '0');
  assert.equal(env.SKS_SERVICE_TIER, 'standard');
});
