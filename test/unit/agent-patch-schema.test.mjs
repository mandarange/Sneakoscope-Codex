import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAgentPatchEnvelope, validateAgentPatchEnvelope } from '../../dist/core/agents/agent-patch-schema.js';

test('agent patch schema accepts unified diffs and lease proof', () => {
  const envelope = normalizeAgentPatchEnvelope({
    agent_id: 'agent-a',
    lease_proof: { lease_id: 'lease-a', allowed_paths: ['a.txt'] },
    operations: [{ op: 'unified_diff', path: 'a.txt', diff: '--- a.txt\n+++ a.txt\n@@\n-old\n+new\n' }]
  });
  assert.equal(envelope.operations[0].op, 'unified_diff');
  assert.equal(validateAgentPatchEnvelope(envelope).ok, true);
});
