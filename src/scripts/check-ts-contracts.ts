#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const requiredFiles = [
  'src/cli/command-registry.ts',
  'src/core/trust-kernel/trust-kernel-schema.ts',
  'src/core/trust-kernel/route-contract.ts',
  'src/core/trust-kernel/completion-contract.ts',
  'src/core/evidence/evidence-schema.ts',
  'src/core/proof/proof-schema.ts',
  'src/core/proof/validation.ts',
  'src/core/wiki-image/image-voxel-schema.ts',
  'src/core/agents/agent-schema.ts',
  'src/core/features/feature-fixtures.ts'
];

const suppressFreeBootstrap = [
  'src/cli/main.ts',
  'src/cli/router.ts',
  'src/core/fsx.ts',
  'src/core/commands/run-command.ts'
];

const issues = [];

for (const rel of suppressFreeBootstrap) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    issues.push(`${rel}:missing`);
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  if (/@ts-nocheck\b/.test(text)) issues.push(`${rel}:ts_nocheck`);
  if (/@ts-ignore\b/.test(text)) issues.push(`${rel}:ts_ignore`);
}

for (const rel of requiredFiles) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    issues.push(`${rel}:missing`);
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  if (/\bany\b/.test(text)) issues.push(`${rel}:any_token`);
  if (!/\bexport\b/.test(text)) issues.push(`${rel}:exports_missing`);
}

const runtimeRegistry = await import(pathToFileURL(path.join(root, 'dist', 'cli', 'command-registry.js')));
const runtimeCommands = Object.keys(runtimeRegistry.COMMANDS || {}).sort();
const typedText = fs.readFileSync(path.join(root, 'src', 'cli', 'command-registry.ts'), 'utf8');
for (const name of ['help', 'version', 'commands', 'run', 'team', 'agent', 'trust', 'proof', 'git', 'wiki', 'bench', 'features']) {
  if (!runtimeCommands.includes(name)) issues.push(`typed_registry_runtime_missing:${name}`);
  if (!new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`).test(typedText)) issues.push(`typed_registry_ts_missing:${name}`);
}

const result = {
  schema: 'sks.ts-contract-check.v1',
  ok: issues.length === 0,
  checked_files: requiredFiles.length,
  runtime_command_count: runtimeCommands.length,
  issues
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
