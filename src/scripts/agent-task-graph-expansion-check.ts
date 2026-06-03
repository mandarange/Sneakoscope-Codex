#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/agents/agent-task-graph.js');
for (const [target, total] of [[5, 8], [5, 25], [20, 40]]) {
  const graph = mod.buildAgentTaskGraph({ routeType: '$Team', prompt: `fixture ${target}/${total}`, targetActiveSlots: target, desiredWorkItems: total, minimumWorkItems: total });
  assertGate(graph.schema === 'sks.agent-task-graph.v1', 'task graph schema mismatch', graph);
  assertGate(graph.target_active_slots === target, 'target active slots mismatch', graph.route_work_count_summary);
  assertGate(graph.total_work_items === total, 'total work items mismatch', graph.route_work_count_summary);
  assertGate(graph.total_work_items > graph.target_active_slots || total === target, 'work items must be independent from active slots', graph.route_work_count_summary);
  assertGate(graph.work_items.every((item) => item.work_item_id && item.required_persona_category && Array.isArray(item.dependencies) && Array.isArray(item.lease_requirements)), 'work item shape incomplete', graph.work_items[0]);
}
emitGate('agent:task-graph-expansion', { fixtures: ['5/8', '5/25', '20/40'] });
