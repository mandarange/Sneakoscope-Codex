#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './lib/codex-sdk-gate-lib.js';

const naruto = readText('src/core/commands/naruto-command.ts');
const runner = readText('src/core/subagents/official-subagent-runner.ts');
const preparation = readText('src/core/subagents/official-subagent-preparation.ts');
const routes = readText('src/core/routes/dollar-manifest-lite.ts');

assertGate(naruto.includes('runOfficialSubagentWorkflow'), 'Naruto must use the official Codex subagent workflow');
assertGate(runner.includes("workflow: 'official_codex_subagent'"), 'Naruto must persist the official subagent workflow contract');
assertGate(runner.includes("'agents.max_depth=1'"), 'official subagent delegation must remain single-depth');
assertGate(preparation.includes('requestedSubagentsExplicit'), 'explicit subagent count intent must be preserved during preparation');
assertGate(preparation.includes('SUBAGENT_PLAN_FILENAME'), 'official workflow must persist its parent-owned subagent plan');
assertGate(routes.includes("{ command: '$Naruto'") && routes.includes("{ command: '$Work'"), 'dollar manifest must expose the canonical workflow and intended alias');

emitGate('codex-sdk:naruto-official-subagent-pipeline', {
  workflow: 'official_codex_subagent',
  current_execution_surface_count: 2,
  max_depth: 1
});
