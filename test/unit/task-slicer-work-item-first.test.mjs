import assert from 'node:assert/strict';
import { buildAgentTaskGraph } from '../../dist/core/agents/agent-task-graph.js';
import { createAgentTaskSlices } from '../../dist/core/agents/work-partition/task-slicer.js';
import test from 'node:test';

test('task slicer can create more slices than roster length', () => {
  const roster = Array.from({ length: 5 }, (_, index) => ({ id: `agent_${index + 1}`, role: 'verifier' }));
  const graph = buildAgentTaskGraph({ routeType: '$Naruto', prompt: 'fixture', targetActiveSlots: 5, desiredWorkItems: 25 });
  const slices = createAgentTaskSlices({ roster, routeWorkGraph: graph });
  assert.equal(slices.length, 25);
  assert.equal(new Set(slices.map((slice) => slice.owner_agent_id)).size, 5);
});
