#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js';

const cockpit = readText('src/core/agents/agent-codex-cockpit.ts');
for (const token of ['source_intelligence_status', 'super_search_status', 'codex_web_search_status', 'goal_mode_status', 'terminal_session_status', 'zellij_attach_command']) {
  assertGate(cockpit.includes(token), `agent live summary missing ${token}`);
}
for (const removed of [
  ['agent-codex', 'dashboard.json'].join('-'),
  ['agent-codex', 'dashboard.md'].join('-'),
  'agent-session-cards.md',
  'agent-progress-timeline.md',
  ['renderAgentCodex', 'Dashboard'].join(''),
  'renderAgentSessionCards',
  'renderAgentProgressTimeline'
]) {
  assertGate(!cockpit.includes(removed), `removed agent presentation output remains: ${removed}`);
}
assertGate(cockpit.includes("schema: 'sks.agent-live-summary.v1'"), 'neutral agent live summary schema missing');
assertGate(cockpit.includes('AGENT_CODEX_COCKPIT_EVENTS'), 'cockpit event stream must remain available');
emitGate('agent:visual-consistency', { live_summary_fields: 6, presentation_outputs: 0 });
