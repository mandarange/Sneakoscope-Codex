#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { assertGate, emitGate, readJson, root } from './sks-1-18-gate-lib.js';

const pkg = readJson('package.json');
const scripts = pkg.scripts || {};
const dry = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024
});
assertGate(dry.status === 0, 'npm pack --dry-run must succeed for package contract check', {
  status: dry.status,
  stderr: dry.stderr
});
const parsed = JSON.parse(dry.stdout || '[]');
const files = new Set<string>((parsed[0]?.files || []).map((row: any) => String(row.path || '').replace(/\\/g, '/')));
const missingTargets: Array<{ script: string; target: string }> = [];
for (const [name, command] of Object.entries(scripts)) {
  for (const target of scriptTargets(String(command))) {
    const normalized = target.replace(/^\.\//, '').replace(/\\/g, '/');
    if (normalized.startsWith('dist/') && !files.has(normalized)) missingTargets.push({ script: name, target: normalized });
  }
}
assertGate(missingTargets.length === 0, 'published package scripts must not reference missing tarball files', {
  missingTargets: missingTargets.slice(0, 50),
  missing_count: missingTargets.length
});
emitGate('package:published-contract', {
  files: files.size,
  script_count: Object.keys(scripts).length,
  missing_targets: 0,
  package: path.basename(parsed[0]?.filename || '')
});

function scriptTargets(command: string): string[] {
  const targets: string[] = [];
  const re = /(?:node|tsx|ts-node)\s+((?:\.\/)?dist\/[^\s;&|]+\.js)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(command))) {
    if (match[1]) targets.push(match[1]);
  }
  return targets;
}
