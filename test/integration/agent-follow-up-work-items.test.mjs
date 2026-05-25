import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentWorkQueue, enqueueFollowUpWorkItems } from '../../dist/core/agents/agent-work-queue.js';

test('follow-up work items are bounded and recorded', () => {
  const queue = createAgentWorkQueue({ slices: [{ id: 'root' }], maxQueueExpansion: 1 });
  const followUp = {
    title: 'Follow-up',
    description: 'Validate generated work.',
    required_persona_category: 'verifier',
    priority: 1,
    dependencies: [],
    lease_requirements: [],
    max_attempts: 1,
    reason: 'fixture'
  };
  const result = enqueueFollowUpWorkItems(queue, [{ id: 'follow-1', ...followUp }, { id: 'follow-2', ...followUp }], { originSessionId: 's1' });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.blocked.length, 1);
});
