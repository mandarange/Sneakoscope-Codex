import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentWorkQueue, enqueueFollowUpWorkItems } from '../../dist/core/agents/agent-work-queue.js';

test('follow-up work items are bounded and recorded', () => {
  const queue = createAgentWorkQueue({ slices: [{ id: 'root' }], maxQueueExpansion: 1 });
  const result = enqueueFollowUpWorkItems(queue, [{ id: 'follow-1' }, { id: 'follow-2' }], { originSessionId: 's1' });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.blocked.length, 1);
});
