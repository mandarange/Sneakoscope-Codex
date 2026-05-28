import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAgentPatchEnvelope, validateAgentPatchEnvelope } from '../../dist/core/agents/agent-patch-schema.js';

test('agent patch schema accepts unified diffs and lease proof', () => {
  const envelope = normalizeAgentPatchEnvelope({
    agent_id: 'agent-a',
    session_id: 'session-a',
    slot_id: 'slot-a',
    generation_index: 1,
    lease_proof: { lease_id: 'lease-a', allowed_paths: ['a.txt'] },
    verification_hint: { command: 'npm test' },
    rollback_hint: { node_id: 'rollback-a' },
    operations: [{ op: 'unified_diff', path: 'a.txt', diff: '--- a.txt\n+++ a.txt\n@@\n-old\n+new\n' }]
  });
  assert.equal(envelope.slot_id, 'slot-a');
  assert.equal(envelope.generation_index, 1);
  assert.equal(envelope.verification_hint.command, 'npm test');
  assert.equal(envelope.operations[0].op, 'unified_diff');
  assert.equal(validateAgentPatchEnvelope(envelope).ok, true);
});

test('agent patch schema rejects missing leases and lease path violations', () => {
  const missingLease = normalizeAgentPatchEnvelope({
    agent_id: 'agent-a',
    operations: [{ op: 'replace', path: 'a.txt', search: 'old', replace: 'new' }]
  });
  const outsideLease = normalizeAgentPatchEnvelope({
    agent_id: 'agent-a',
    lease_proof: { lease_id: 'lease-a', allowed_paths: ['allowed'] },
    operations: [{ op: 'replace', path: 'other/file.txt', search: 'old', replace: 'new' }]
  });
  assert.match(validateAgentPatchEnvelope(missingLease).violations.join('\n'), /lease_id_missing/);
  assert.match(validateAgentPatchEnvelope(outsideLease).violations.join('\n'), /lease_path_not_allowed/);
});
