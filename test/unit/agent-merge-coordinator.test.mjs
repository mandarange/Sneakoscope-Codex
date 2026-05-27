import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinateAgentPatchMerge } from '../../dist/core/agents/agent-merge-coordinator.js';

test('agent merge coordinator reports parallel batches and serial conflicts', () => {
  const clean = coordinateAgentPatchMerge([
    { schema: 'sks.agent-patch-envelope.v1', agent_id: 'a', operations: [{ op: 'write', path: 'a.txt', content: 'a' }] },
    { schema: 'sks.agent-patch-envelope.v1', agent_id: 'b', operations: [{ op: 'write', path: 'b.txt', content: 'b' }] }
  ]);
  const conflict = coordinateAgentPatchMerge([
    { schema: 'sks.agent-patch-envelope.v1', agent_id: 'a', operations: [{ op: 'write', path: 'same.txt', content: 'a' }] },
    { schema: 'sks.agent-patch-envelope.v1', agent_id: 'b', operations: [{ op: 'write', path: './same.txt', content: 'b' }] }
  ]);
  assert.equal(clean.ok, true);
  assert.ok(clean.parallel_batches.length >= 1);
  assert.equal(conflict.ok, false);
  assert.ok(conflict.serial_conflicts.length >= 1);
});
