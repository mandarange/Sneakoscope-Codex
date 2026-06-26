#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures: string[] = [];
const routeCli = path.join(root, 'src', 'core', 'commands', 'route-cli.mjs');
if (fs.existsSync(routeCli)) failures.push('src/core/commands/route-cli.mjs must not exist in runtime source');

const legacyCommandsDir = path.join(root, 'src', 'commands');
if (fs.existsSync(legacyCommandsDir)) {
  for (const file of listFiles(legacyCommandsDir, '.mjs')) {
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes('route-cli.mjs')) failures.push(`${rel(file)} imports route-cli.mjs`);
  }
}

for (const relModule of registeredCommandModules()) {
  if (!fs.existsSync(path.join(root, relModule))) failures.push(`registered command module missing: ${relModule}`);
}

const disallowedImports = {
  'qa-loop-command.ts': ['research-command', 'ppt-command', 'team-command', 'gx-command'],
  'research-command.ts': ['qa-loop-command', 'ppt-command', 'team-command', 'gx-command'],
  'db-command.ts': ['image-ux-review-command', 'ppt-command', 'computer-use-command'],
  'wiki-command.ts': ['team-command', 'research-command', 'qa-loop-command', 'ppt-command']
};
for (const [name, needles] of Object.entries(disallowedImports)) {
  const file = commandModulePath(name);
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

function registeredCommandModules(): string[] {
  const registry = fs.readFileSync(path.join(root, 'src', 'cli', 'command-registry.ts'), 'utf8');
  const out = new Set<string>();
  for (const match of registry.matchAll(/['"]dist\/core\/commands\/([^'"]+)\.js['"]/g)) {
    const stem = match[1];
    if (stem) out.add(`src/core/commands/${stem}.ts`);
  }
  return [...out].sort();
}

function listFiles(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(file, ext));
    else if (entry.name.endsWith(ext)) out.push(file);
  }
  return out;
}

function rel(file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

function commandModulePath(name: string): string {
  const base = path.join(root, 'src', 'core', 'commands');
  const mjs = path.join(base, name.replace(/\.ts$/, '.mjs'));
  const ts = path.join(base, name.replace(/\.mjs$/, '.ts'));
  return fs.existsSync(mjs) ? mjs : ts;
}
