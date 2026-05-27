import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryAgentPatchQueue } from '../../dist/core/agents/agent-patch-queue.js';

test('agent patch queue records transitions and ownership ledger', () => {
  const queue = new InMemoryAgentPatchQueue();
  const entry = queue.enqueue({ agent_id: 'agent-a', lease_id: 'lease-a', operations: [{ op: 'write', path: 'a.txt', content: 'a' }] });
  queue.markApplying(entry.id);
  queue.markApplied(entry.id);
  const json = queue.toJSON();
  assert.equal(json.events.length, 3);
  assert.equal(json.ownership_ledger[0].lease_id, 'lease-a');
});
