#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const dir = path.join(root, 'src', 'core', 'commands');
const failures: string[] = [];
const changedFiles = changedFileSet();
for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('-command.ts'))) {
  const absolute = path.join(dir, file);
  const relPath = rel(absolute);
  const text = fs.readFileSync(absolute, 'utf8');
  const lines = text.split(/\r?\n/).length;
  const imports = [...text.matchAll(/^\s*import\s+/gm)].length;
  const changed = changedFiles.has(relPath);
  const baselineLines = baseLineCount(relPath);
  if (lines > 1800) failures.push(`${file}: line count ${lines} > 1800 hard ceiling`);
  if (baselineLines === null && lines > 400) failures.push(`${file}: new command module ${lines} lines > 400`);
  if (changed && lines > 1200 && (baselineLines === null || lines - baselineLines > 50)) {
    failures.push(`${file}: changed command module grew to ${lines} lines > 1200`);
  }
  if (imports > 60) failures.push(`${file}: import count ${imports} > 60 hard ceiling`);
  if (changed && imports > 35) failures.push(`${file}: changed command module import count ${imports} > 35`);
}
if (failures.length) {
  console.error('Command module budget check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Command module budget check passed');

function changedFileSet(): Set<string> {
  const out = new Set<string>();
  for (const line of gitLines(['diff', '--name-only', 'HEAD', '--'])) out.add(normalize(line));
  for (const line of gitLines(['ls-files', '--others', '--exclude-standard'])) out.add(normalize(line));
  return out;
}

function baseLineCount(relPath: string): number | null {
  const result = spawnSync('git', ['show', `HEAD:${relPath}`], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) return null;
  const text = String(result.stdout || '');
  return text ? text.split(/\r?\n/).length : 0;
}

function gitLines(args: string[]): string[] {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return [];
  return String(result.stdout || '').split(/\r?\n/).map(normalize).filter(Boolean);
}

function rel(file: string): string {
  return normalize(path.relative(root, file));
}

function normalize(file: string): string {
  return String(file || '').replace(/\\/g, '/');
}
