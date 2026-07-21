#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/agents/agent-task-graph.js');
for (const [target, total] of [[5, 8], [8, 25], [12, 40]]) {
  const graph = mod.buildAgentTaskGraph({ routeType: '$Naruto', prompt: `fixture ${target}/${total}`, targetActiveSlots: target, desiredWorkItems: total, minimumWorkItems: total });
  const expectedActiveSlots = target;
  assertGate(graph.schema === 'sks.agent-task-graph.v1', 'task graph schema mismatch', graph);
  assertGate(graph.route_type === '$Naruto', 'task graph must use the current official-subagent route', graph.route_work_count_summary);
  assertGate(graph.target_active_slots === expectedActiveSlots, 'worker-runtime active slot cap mismatch', graph.route_work_count_summary);
  assertGate(graph.total_work_items === total, 'total work items mismatch', graph.route_work_count_summary);
  assertGate(graph.total_work_items > graph.target_active_slots || total === expectedActiveSlots, 'work items must be independent from bounded active slots', graph.route_work_count_summary);
  assertGate(graph.work_items.every((item) => item.work_item_id && item.required_persona_category && Array.isArray(item.dependencies) && Array.isArray(item.lease_requirements)), 'work item shape incomplete', graph.work_items[0]);
}
emitGate('agent:task-graph-expansion', { route: '$Naruto', active_slot_cap: 'naruto_frame_budget', fixtures: ['5/8', '8/25', '12/40'] });
