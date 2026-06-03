#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/codex-control/codex-reliability-shield.js');
const repaired = mod.repairToolCallSequence([
  { type: 'thread.started' },
  { type: 'item.completed', item: { id: 'call-1', type: 'mcp_tool_call', tool: 'fixture' } },
  { type: 'item.completed', item: { id: 'call-2', type: 'mcp_tool_call', tool: 'fixture' } },
  { type: 'tool_result.completed', item: { tool_call_id: 'call-1', type: 'tool_result', text: 'ok' } }
]);
assertGate(repaired.repairedToolResultCount === 1, 'one missing parallel tool result must be repaired', repaired);
assertGate(repaired.events.some((event) => event.type === 'tool_result.stubbed' && event.item?.tool_call_id === 'call-2'), 'missing tool result stub not found', repaired);
emitGate('codex-control:tool-call-sequence-repair', { repaired_tool_result_count: repaired.repairedToolResultCount });
