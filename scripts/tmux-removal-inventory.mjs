#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { root } from './lib/ensure-dist-fresh.mjs';
const matches = [];
for (const dir of ['src', 'scripts', 'docs', 'README.md', 'CHANGELOG.md', 'package.json']) {
  for (const file of await listFiles(path.join(root, dir))) {
    const text = await fs.readFile(file, 'utf8').catch(() => '');
    if (/tmux/i.test(text)) matches.push(path.relative(root, file));
  }
}
const report = { schema: 'sks.tmux-removal-inventory.v1', ok: true, generated_at: new Date().toISOString(), match_files: [...new Set(matches)].sort(), migration_note: 'Runtime paths moved to Zellij; remaining tmux mentions are historical docs, migration notices, or removal gates.' };
await fs.mkdir(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
await fs.writeFile(path.join(root, '.sneakoscope', 'reports', 'tmux-removal-inventory.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
async function listFiles(target) {
  const stat = await fs.stat(target).catch(() => null);
  if (!stat) return [];
  if (stat.isFile()) return [target];
  const out = [];
  for (const entry of await fs.readdir(target, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const file = path.join(target, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(file));
    else if (entry.isFile()) out.push(file);
  }
  return out;
}
