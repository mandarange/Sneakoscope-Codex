#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate } from './sks-1-18-gate-lib.js';
import { buildQaContractV2 } from '../core/qa-loop/qa-contract-v2.js';
import { evaluateQaGateV2 } from '../core/qa-loop/qa-gate-v2.js';
import { initializeQaRuntimeArtifacts } from '../core/qa-loop/qa-runtime-artifacts.js';
import { selectQaSurface } from '../core/qa-loop/qa-surface-router.js';

const cases = [
  ['localhost no auth chooses Browser', selectQaSurface({ targetUrl: 'http://localhost:3000/settings', prompt: 'test local web settings' }).selected_surface, 'codex_in_app_browser'],
  ['public no auth chooses Browser', selectQaSurface({ targetUrl: 'https://example.com', prompt: 'public marketing page QA' }).selected_surface, 'codex_in_app_browser'],
  ['signed-in browser state chooses Chrome', selectQaSurface({ targetUrl: 'https://example.com/app', prompt: 'verify logged-in cookie profile flow' }).selected_surface, 'codex_chrome_extension'],
  ['extension-dependent site chooses Chrome', selectQaSurface({ targetUrl: 'https://example.com', prompt: 'browser extension dependent QA' }).selected_surface, 'codex_chrome_extension'],
  ['native macOS GUI chooses Computer Use', selectQaSurface({ prompt: 'native macOS Settings GUI bug' }).selected_surface, 'codex_computer_use'],
  ['native Windows GUI chooses Computer Use', selectQaSurface({ prompt: 'Windows desktop app dialog bug' }).selected_surface, 'codex_computer_use'],
  ['structured data without UI chooses MCP', selectQaSurface({ prompt: 'Gmail data sync check', uiRequired: false, targetKind: 'structured_data' }).selected_surface, 'structured_mcp']
];

for (const [label, actual, expected] of cases) {
  assertGate(actual === expected, `${label}: expected ${expected}, got ${actual}`, { actual, expected });
}

const contract = buildQaContractV2({
  prompt: 'QA local settings form at http://localhost:3000',
  answers: {
    QA_SCOPE: 'ui_e2e_only',
    TARGET_BASE_URL: 'http://localhost:3000',
    LOGIN_REQUIRED: 'no',
    MAX_QA_CYCLES: ''
  }
}, { missionId: 'M-router-check' });
assertGate(contract.runtime.max_cycles === 5, 'QA contract v2 default max cycles must be 5', contract.runtime);
assertGate(contract.mutation.source_code_patch_policy === 'enabled', 'safe local source fixes must default on unless report-only', contract.mutation);

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-qa-router-'));
await initializeQaRuntimeArtifacts(tmp, contract, { missionId: 'M-router-check' });
let gate = await evaluateQaGateV2(tmp);
assertGate(gate.passed === false, 'UI-required QA cannot pass with zero real actions', gate);
assertGate(gate.blockers.includes('ui_required_but_real_action_count_zero'), 'zero-action blocker missing', gate);

await fs.appendFile(path.join(tmp, 'qa-loop', 'action-ledger.jsonl'), `${JSON.stringify({ schema: 'sks.qa-loop-action.v2', status: 'completed', real: true, journey_fingerprint: 'J', kind: 'click' })}\n`);
await fs.appendFile(path.join(tmp, 'qa-loop', 'observation-ledger.jsonl'), `${JSON.stringify({ schema: 'sks.qa-loop-observation.v2', status: 'observed', real: true, journey_fingerprint: 'J', kind: 'visual_delta' })}\n`);
gate = await evaluateQaGateV2(tmp);
assertGate(gate.real_action_count === 1 && gate.observation_count === 1, 'real action and observation ledgers must be counted', gate);

emitGate('qa-loop:surface-router', {
  matrix_cases: cases.length,
  default_max_cycles: contract.runtime.max_cycles,
  zero_action_blocked: true,
  selected_surface: contract.target.kind
});
