#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, packageScripts, root } from './sks-1-18-gate-lib.mjs';

const scripts = packageScripts();
const required = [
  'codex:0.134-compat',
  'codex:0.134-official-compat',
  'codex:profile-primary',
  'codex:managed-proxy-env',
  'mcp:0.134-modernization',
  'source-intelligence:codex-history-search',
  'agent:parallel-write-kernel',
  'agent:parallel-write-blackbox',
  'team:parallel-write-blackbox',
  'dfix:parallel-write-blackbox',
  'agent:patch-proof',
  'agent:patch-rollback',
  'release:runtime-truth-matrix'
];

for (const name of required) {
  assertGate(Boolean(scripts[name]), `missing release gate script: ${name}`, { required });
  const match = String(scripts[name]).match(/node\s+(\.\/scripts\/[^ ]+\.mjs)/);
  if (match) assertGate(fs.existsSync(path.join(root, match[1])), `script target missing for ${name}`, { command: scripts[name] });
}
emitGate('release:gate-existence-audit', { gates: required.length });
