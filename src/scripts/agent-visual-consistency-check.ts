#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js';

const cockpit = readText('src/core/agents/agent-codex-cockpit.ts');
for (const token of ['source_intelligence_status', 'ultra_search_status', 'codex_web_search_status', 'goal_mode_status', 'terminal_session_status', 'zellij_attach_command']) {
  assertGate(cockpit.includes(token), `Codex App cockpit missing ${token}`);
}
emitGate('agent:visual-consistency', { dashboard_fields: 6 });
