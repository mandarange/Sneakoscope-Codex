#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, readText, root } from './sks-1-18-gate-lib.js';

const officialWorkflowFiles = [
  'src/core/commands/naruto-command.ts',
  'src/core/subagents/official-subagent-preparation.ts',
  'src/core/subagents/official-subagent-runner.ts'
];
const forbiddenRuntimeTokens = [
  'runCodexExecAgent',
  'runNativeCliWorkerRuntime',
  'agent-command-surface',
  'agent-runner-process',
  'agent-runner-codex-exec'
];
const violations: string[] = [];

for (const file of officialWorkflowFiles) {
  assertGate(fs.existsSync(path.join(root, file)), `official subagent source missing: ${file}`);
  const source = readText(file);
  for (const token of forbiddenRuntimeTokens) {
    if (source.includes(token)) violations.push(`${file}:${token}`);
  }
}

const naruto = readText('src/core/commands/naruto-command.ts');
const runner = readText('src/core/subagents/official-subagent-runner.ts');
assertGate(naruto.includes('runOfficialSubagentWorkflow'), 'Naruto must not fall back from the official subagent workflow');
assertGate(runner.includes("workflow: 'official_codex_subagent'"), 'official subagent workflow identity missing');
assertGate(violations.length === 0, 'retired process scheduler fallback is reachable from the official subagent workflow', { violation_count: violations.length });
assertGate(!fs.existsSync(path.join(root, 'src/core/commands/agent-command.ts')), 'retired public scheduler handler must be physically absent');
assertGate(!fs.existsSync(path.join(root, 'src/core/agents/agent-command-surface.ts')), 'retired public scheduler parser must be physically absent');

emitGate('codex-sdk:no-legacy-fallback', {
  checked_file_count: officialWorkflowFiles.length,
  forbidden_runtime_token_count: forbiddenRuntimeTokens.length,
  workflow: 'official_codex_subagent'
});
