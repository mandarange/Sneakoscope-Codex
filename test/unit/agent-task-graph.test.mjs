import assert from 'node:assert/strict';
import { buildAgentTaskGraph } from '../../dist/core/agents/agent-task-graph.js';
import test from 'node:test';

test('agent task graph expands work items beyond active slots', () => {
  const graph = buildAgentTaskGraph({ routeType: '$Fixture', prompt: 'fixture', targetActiveSlots: 5, desiredWorkItems: 8 });
  assert.equal(graph.schema, 'sks.agent-task-graph.v1');
  assert.equal(graph.target_active_slots, 5);
  assert.equal(graph.total_work_items, 8);
  assert.equal(graph.route_work_count_summary.work_items_exceed_active_slots, true);
});

test('agent task graph honors more than four concurrent Naruto slots', () => {
  const graph = buildAgentTaskGraph({ routeType: '$Naruto', prompt: 'fixture', targetActiveSlots: 8, desiredWorkItems: 12 });
  assert.equal(graph.target_active_slots, 8);
  assert.ok(graph.target_active_slots > 4);
});
