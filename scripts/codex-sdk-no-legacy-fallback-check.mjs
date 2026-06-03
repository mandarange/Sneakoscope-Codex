#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, readText, root } from './sks-1-18-gate-lib.mjs';

const runtimeFiles = [
  'src/core/agents/agent-orchestrator.ts',
  'src/core/agents/native-worker-backend-router.ts',
  'src/core/agents/agent-command-surface.ts',
  'src/core/commands/team-command.ts',
  'src/core/commands/qa-loop-command.ts',
  'src/core/commands/research-command.ts',
  'src/core/commands/naruto-command.ts',
  'src/core/commands/mad-sks-command.ts'
];
const violations = [];
for (const file of runtimeFiles) {
  const text = readText(file);
  const allowedLegacyBlocker = file.includes('agent-orchestrator') || file.includes('native-worker-backend-router');
  if (text.includes("runCodexExecAgent")) violations.push(`${file}:runCodexExecAgent`);
  if (text.includes("codex-exec'") && !allowedLegacyBlocker && !file.includes('naruto-command')) violations.push(`${file}:codex-exec-default-or-usage`);
  if (text.includes('codex-exec|fake')) violations.push(`${file}:legacy-help`);
  if (text.includes("mock ? 'fake' : 'codex-exec'")) violations.push(`${file}:legacy-default`);
}
const allSource = fs.readdirSync(path.join(root, 'src', 'core', 'codex-control'));
assertGate(allSource.includes('codex-sdk-adapter.ts'), 'Codex SDK adapter source missing');
assertGate(violations.length === 0, 'legacy Codex exec fallback still reachable', { violations });
emitGate('codex-sdk:no-legacy-fallback', { checked_files: runtimeFiles.length });
