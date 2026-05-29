#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { root } from './lib/ensure-dist-fresh.mjs';

const productionGlobs = ['src', 'package.json'];
const allowFiles = new Set([
  'src/commands/tmux.ts',
  'scripts/runtime-no-tmux-check.mjs',
  'scripts/tmux-removal-inventory.mjs',
  'scripts/tmux-keyboard-enhancement-safety-check.mjs',
  'scripts/tmux-tui-output-stability-check.mjs'
]);
const issues = [];
for (const base of productionGlobs) {
  for (const file of await listFiles(path.join(root, base))) {
    const rel = path.relative(root, file);
    if (allowFiles.has(rel)) continue;
    const text = await fs.readFile(file, 'utf8');
    if (rel === 'package.json') {
      const pkg = JSON.parse(text);
      for (const [name, command] of Object.entries(pkg.scripts || {})) {
        const allowed = ['tmux:keyboard-enhancement-safety', 'tmux:tui-output-stability', 'runtime:no-tmux'].includes(name);
        if (!allowed && (/tmux|warp-right-lane/.test(name) || /agent-tmux|real-tmux|tmux-|warp-right-lane|mad-sks-warp/.test(String(command)))) issues.push(`package.json:${name}`);
      }
      continue;
    }
    if (/runProcess\(['"]tmux['"]|from ['"].*tmux|import .*tmux|npm run .*tmux:|agent:tmux|mad-sks:warp-right-lane-attach/.test(text)) issues.push(rel);
  }
}
const ok = issues.length === 0;
emit({ schema: 'sks.runtime-no-tmux-check.v1', ok, issues, allow_files: [...allowFiles] });

async function listFiles(target) {
  const out = [];
  const stat = await fs.stat(target).catch(() => null);
  if (!stat) return out;
  if (stat.isFile()) return [target];
  for (const entry of await fs.readdir(target, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const file = path.join(target, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(file));
    else if (entry.isFile() && /\.(ts|js|json)$/.test(entry.name)) out.push(file);
  }
  return out;
}
function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
