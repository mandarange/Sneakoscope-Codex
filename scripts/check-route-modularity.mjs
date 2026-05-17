#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const routeCli = path.join(root, 'src', 'core', 'commands', 'route-cli.mjs');
if (fs.existsSync(routeCli)) failures.push('src/core/commands/route-cli.mjs must not exist in runtime source');

for (const file of listFiles(path.join(root, 'src', 'commands'), '.mjs')) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('route-cli.mjs')) failures.push(`${rel(file)} imports route-cli.mjs`);
}

const requiredModules = [
  'team-command.mjs',
  'qa-loop-command.mjs',
  'research-command.mjs',
  'autoresearch-command.mjs',
  'ppt-command.mjs',
  'image-ux-review-command.mjs',
  'computer-use-command.mjs',
  'db-command.mjs',
  'wiki-command.mjs',
  'gx-command.mjs',
  'goal-command.mjs',
  'pipeline-command.mjs',
  'recallpulse-command.mjs',
  'hproof-command.mjs',
  'validate-artifacts-command.mjs'
];
for (const name of requiredModules) {
  if (!fs.existsSync(path.join(root, 'src', 'core', 'commands', name))) failures.push(`missing ${name}`);
}

const disallowedImports = {
  'qa-loop-command.mjs': ['research-command', 'ppt-command', 'team-command', 'gx-command'],
  'research-command.mjs': ['qa-loop-command', 'ppt-command', 'team-command', 'gx-command'],
  'db-command.mjs': ['image-ux-review-command', 'ppt-command', 'computer-use-command'],
  'wiki-command.mjs': ['team-command', 'research-command', 'qa-loop-command', 'ppt-command']
};
for (const [name, needles] of Object.entries(disallowedImports)) {
  const file = path.join(root, 'src', 'core', 'commands', name);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of needles) {
    if (text.includes(needle)) failures.push(`${name} imports unrelated ${needle}`);
  }
}

if (failures.length) {
  console.error('Route modularity check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Route modularity check passed');

function listFiles(dir, ext) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(file, ext));
    else if (entry.name.endsWith(ext)) out.push(file);
  }
  return out;
}

function rel(file) {
  return path.relative(root, file).split(path.sep).join('/');
}
