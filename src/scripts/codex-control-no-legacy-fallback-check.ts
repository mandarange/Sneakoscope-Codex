#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, readText, root } from './sks-1-18-gate-lib.js';

const runtimeFiles = [
  'src/core/agents/agent-orchestrator.ts',
  'src/core/agents/native-worker-backend-router.ts',
  'src/core/commands/qa-loop-command.ts',
  'src/core/commands/research-command.ts',
  'src/core/commands/naruto-command.ts',
  'src/core/commands/mad-sks-command.ts'
];
const violations = [];
for (const file of runtimeFiles) {
  const text = readText(file);
  if (text.includes("runCodexExecAgent")) violations.push(`${file}:runCodexExecAgent`);
  if (text.includes("mock ? 'fake' : 'codex-exec'")) violations.push(`${file}:legacy-default`);
  if (text.includes('codex-exec|fake')) violations.push(`${file}:legacy-help`);
}
const controlFiles = fs.readdirSync(path.join(root, 'src', 'core', 'codex-control'));
assertGate(controlFiles.includes('codex-control-plane.ts'), 'Codex Control Plane source missing');
assertGate(controlFiles.includes('codex-reliability-shield.ts'), 'Codex Reliability Shield source missing');
assertGate(readText('src/core/agents/native-worker-backend-router.ts').includes("legacy_codex_exec_runtime_removed"), 'explicit codex-exec request must block');
assertGate(violations.length === 0, 'legacy Codex exec fallback still reachable', { violations });
emitGate('codex-control:no-legacy-fallback', { checked_files: runtimeFiles.length });
