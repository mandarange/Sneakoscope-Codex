import assert from 'node:assert/strict';
import { buildAgentTaskGraph } from '../../dist/core/agents/agent-task-graph.js';
import test from 'node:test';

test('task graph records requested active slots, desired work items, and minimum work items', () => {
  const graph = buildAgentTaskGraph({ routeType: '$Fixture', prompt: 'fixture', targetActiveSlots: 5, desiredWorkItems: 8, minimumWorkItems: 5 });
  assert.equal(graph.target_active_slots, 4);
  assert.equal(graph.desired_work_items, 8);
  assert.equal(graph.minimum_work_items, 5);
  assert.equal(graph.total_work_items, 8);
});
