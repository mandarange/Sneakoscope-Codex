#!/usr/bin/env node
import { assertGate, emitGate, exists, readJson } from './sks-1-18-gate-lib.js';
import { REQUIRED_3113_RELEASE_IDS } from './release-3113-required-gates.js';

const scripts = readJson('package.json').scripts || {};
for (const id of REQUIRED_3113_RELEASE_IDS) assertGate(Boolean(scripts[id]), `3.1.13 regression required script missing: ${id}`);
for (const file of [
  'src/core/codex-control/codex-0140-usage-parser.ts',
  'src/core/doctor/doctor-transaction.ts',
  'src/core/codex/agent-config-file-repair.ts',
  'src/core/mcp/mcp-config-preservation.ts',
  'src/core/config/secret-preservation.ts',
  'src/core/codex-native/native-capability-postcheck.ts'
]) assertGate(exists(file), `3.1.13 regression required file missing: ${file}`);
emitGate('sks:3113-all-feature-regression', { scenarios: REQUIRED_3113_RELEASE_IDS.length });
