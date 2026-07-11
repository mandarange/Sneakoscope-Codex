#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const dir = path.join(root, 'src', 'core', 'commands');
const failures: string[] = [];
const changeStats = changedFileStats();
for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('-command.ts'))) {
  const absolute = path.join(dir, file);
  const relPath = rel(absolute);
  const text = fs.readFileSync(absolute, 'utf8');
  const lines = text.split(/\r?\n/).length;
  const imports = [...text.matchAll(/^\s*import\s+/gm)].length;
  const change = changeStats.get(relPath);
  const changed = change !== undefined;
  const baselineLines = change?.baselineLines ?? (changed ? null : lines);
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

function changedFileStats(): Map<string, { baselineLines: number | null }> {
  const out = new Map<string, { baselineLines: number | null }>();
  const headFiles = new Set(gitLines(['ls-tree', '-r', '--name-only', 'HEAD', '--', 'src/core/commands']));
  // One numstat process gives us enough information to reconstruct the
  // baseline line count for every tracked command module. The old per-file
  // `git show` loop spawned roughly sixty processes and could exceed the
  // 15-second gate timeout when the canonical test runner was saturated.
  // Disable rename collapsing so the current destination remains an exact
  // path. A destination absent from HEAD is conservatively treated as new,
  // matching the old `git show HEAD:<path>` behavior.
  for (const line of gitLines(['diff', '--no-renames', '--numstat', 'HEAD', '--', 'src/core/commands'])) {
    const [addedRaw, deletedRaw, ...pathParts] = line.split('\t');
    const relPath = normalize(pathParts.join('\t'));
    if (!relPath) continue;
    if (!headFiles.has(relPath)) {
      out.set(relPath, { baselineLines: null });
      continue;
    }
    const added = Number(addedRaw);
    const deleted = Number(deletedRaw);
    if (!Number.isFinite(added) || !Number.isFinite(deleted)) {
      out.set(relPath, { baselineLines: null });
      continue;
    }
    const absolute = path.join(root, relPath);
    const currentLines = fs.existsSync(absolute)
      ? fs.readFileSync(absolute, 'utf8').split(/\r?\n/).length
      : 0;
    out.set(relPath, { baselineLines: Math.max(0, currentLines - added + deleted) });
  }
  for (const line of gitLines(['ls-files', '--others', '--exclude-standard', '--', 'src/core/commands'])) {
    out.set(normalize(line), { baselineLines: null });
  }
  return out;
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
