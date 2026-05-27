import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryAgentPatchQueue } from '../../dist/core/agents/agent-patch-queue.js';
import { coordinateAgentPatchMerge } from '../../dist/core/agents/agent-merge-coordinator.js';

test('parallel write agents produce non-overlap merge evidence', () => {
  const queue = new InMemoryAgentPatchQueue();
  queue.enqueue({ agent_id: 'a', operations: [{ op: 'write', path: 'a.txt', content: 'a' }] });
  queue.enqueue({ agent_id: 'b', operations: [{ op: 'write', path: 'b.txt', content: 'b' }] });
  const merge = coordinateAgentPatchMerge(queue.queued().map((entry) => entry.envelope));
  assert.equal(merge.ok, true);
  assert.ok(merge.wall_clock_parallel_evidence.length >= 1);
});
