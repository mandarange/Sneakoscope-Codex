import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryAgentPatchQueue } from '../../dist/core/agents/agent-patch-queue.js';
import { coordinateAgentPatchMerge } from '../../dist/core/agents/agent-merge-coordinator.js';

test('parallel write agents produce non-overlap merge evidence', () => {
  const queue = new InMemoryAgentPatchQueue();
  queue.enqueue({ agent_id: 'a', session_id: 'sess-1', slot_id: 'slot-1', generation_index: 0, lease_id: 'lease-a', operations: [{ op: 'write', path: 'a.txt', content: 'a' }] });
  queue.enqueue({ agent_id: 'b', session_id: 'sess-2', slot_id: 'slot-2', generation_index: 0, lease_id: 'lease-b', operations: [{ op: 'write', path: 'b.txt', content: 'b' }] });
  const merge = coordinateAgentPatchMerge(queue.queued().map((entry) => entry.envelope));
  assert.equal(merge.ok, true);
  assert.ok(merge.wall_clock_parallel_evidence.length >= 1);
});
