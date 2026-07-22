#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, root } from './sks-1-11-gate-lib.js';

const gate = process.argv[2] || 'release:official-subagent-workflow';
const requiredFiles = [
  'src/core/commands/naruto-command.ts',
  'src/core/subagents/official-subagent-config.ts',
  'src/core/subagents/official-subagent-preparation.ts',
  'src/core/subagents/official-subagent-runner.ts',
  'src/core/subagents/subagent-evidence.ts',
  'src/core/subagents/naruto-help-contract.ts',
  'src/core/routes/dollar-manifest-lite.ts'
];

for (const file of requiredFiles) {
  assertGate(fs.existsSync(path.join(root, file)), `missing official subagent workflow source: ${file}`);
}

const naruto = text('src/core/commands/naruto-command.ts');
const preparation = text('src/core/subagents/official-subagent-preparation.ts');
const runner = text('src/core/subagents/official-subagent-runner.ts');
const evidence = text('src/core/subagents/subagent-evidence.ts');
const routes = text('src/core/routes/dollar-manifest-lite.ts');
const registry = text('src/cli/command-registry.ts');
const pkg = JSON.parse(text('package.json'));
const releaseManifest = JSON.parse(text('release-gates.v2.json'));

assertGate(naruto.includes('runOfficialSubagentWorkflow'), 'Naruto must execute through the Codex official subagent workflow');
assertGate(naruto.includes('prepareOfficialSubagentMission'), 'Naruto must prepare a bounded official subagent mission before delegation');
assertGate(naruto.includes('persistOrReuseTrustworthySubagentParentSummary'), 'Naruto must persist a trustworthy parent integration summary');
assertGate(runner.includes("workflow: 'official_codex_subagent'"), 'official workflow identity must be persisted');
assertGate(runner.includes("'agents.max_depth=1'"), 'official subagent depth must remain parent-owned and non-recursive');
assertGate(runner.includes('features.multi_agent_v2='), 'official Naruto path must enable stable multi-agent V2');
assertGate(runner.includes('agents.max_concurrent_threads_per_session='), 'official Naruto path must use 0.145 concurrency key');
assertGate(runner.includes('requested_subagents') && runner.includes('max_threads'), 'official workflow must record requested and effective thread budgets');
for (const artifact of [
  'subagent-plan.json',
  'subagent-events.jsonl',
  'subagent-parent-summary.json',
  'subagent-evidence.json',
  'naruto-gate.json',
  'naruto-summary.json'
]) {
  assertGate(`${naruto}\n${preparation}\n${evidence}`.includes(artifact), `official subagent evidence contract missing ${artifact}`);
}

assertGate(routes.includes("{ command: '$Naruto'"), 'current dollar manifest must expose the canonical workflow');
assertGate(routes.includes("{ command: '$Work'"), 'current dollar manifest must expose only the intended execution alias');
assertGate(/\bnaruto:\s+routeStateMutator\(entry\(/.test(registry), 'CLI registry must expose the current Naruto workflow');
assertGate(!fs.existsSync(path.join(root, 'src/core/commands/agent-command.ts')), 'retired public scheduler handler must not remain');
assertGate(!fs.existsSync(path.join(root, 'src/core/agents/agent-command-surface.ts')), 'retired public scheduler parser must not remain');

const retiredRuntimeImportViolations: string[] = [];
for (const file of [
  'src/core/commands/naruto-command.ts',
  'src/core/subagents/official-subagent-preparation.ts',
  'src/core/subagents/official-subagent-runner.ts'
]) {
  const source = text(file);
  for (const forbiddenImport of [
    'agent-command-surface',
    'native-cli-worker-runtime',
    'agent-runner-process',
    'agent-runner-codex-exec'
  ]) {
    if (source.includes(forbiddenImport)) retiredRuntimeImportViolations.push(`${file}:${forbiddenImport}`);
  }
}
assertGate(retiredRuntimeImportViolations.length === 0, 'official subagent workflow must not import retired scheduler runtime', { violation_count: retiredRuntimeImportViolations.length });

for (const script of ['naruto:e2e-hermetic', 'naruto:e2e-hermetic-write']) {
  assertGate(Boolean(pkg.scripts?.[script]), `missing official subagent verification script: ${script}`);
}
const releaseGateIds = new Set(
  releaseManifest.gates
    .filter((entry: any) => Array.isArray(entry.preset) && entry.preset.includes('release'))
    .map((entry: any) => entry.id)
);
const incrementalGateIds = new Set(
  releaseManifest.gates
    .filter((entry: any) => Array.isArray(entry.preset) && entry.preset.includes('incremental'))
    .map((entry: any) => entry.id)
);
assertGate(releaseGateIds.has('naruto:canonical-stop-gate'), 'release manifest missing official subagent gate: naruto:canonical-stop-gate');
assertGate(incrementalGateIds.has('test:official-subagent-policy'), 'incremental manifest missing official subagent gate: test:official-subagent-policy');

emitGate(gate, {
  workflow: 'official_codex_subagent',
  required_source_count: requiredFiles.length,
  required_release_gate_count: 1,
  required_incremental_gate_count: 1,
  parent_owned_integration: true,
  max_depth: 1
});

function text(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
