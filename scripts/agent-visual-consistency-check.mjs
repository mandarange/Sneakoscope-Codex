#!/usr/bin/env node
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.mjs';

const cockpit = readText('src/core/agents/agent-codex-cockpit.ts');
for (const token of ['source_intelligence_status', 'xai_status', 'codex_web_search_status', 'goal_mode_status', 'terminal_session_status', 'tmux_attach_command']) {
  assertGate(cockpit.includes(token), `Codex App cockpit missing ${token}`);
}
emitGate('agent:visual-consistency', { dashboard_fields: 6 });
