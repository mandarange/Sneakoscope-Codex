import test from 'node:test';
import assert from 'node:assert/strict';
import { completeWorkItem, createAgentWorkQueue, leaseNextWorkItem, pendingWorkItems } from '../../dist/core/agents/agent-work-queue.js';

test('work queue leases dependency-released pending items', () => {
  const queue = createAgentWorkQueue({ slices: [{ id: 'a' }, { id: 'b', dependencies: ['a'] }] });
  assert.equal(pendingWorkItems(queue).length, 1);
  const first = leaseNextWorkItem(queue, 's1');
  assert.equal(first.id, 'a');
  completeWorkItem(queue, 'a', 's1', 'completed');
  assert.equal(pendingWorkItems(queue)[0].id, 'b');
});
