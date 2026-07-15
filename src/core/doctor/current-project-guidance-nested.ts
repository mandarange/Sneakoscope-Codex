import type { Dirent } from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { inspectConfinedPath } from '../managed-path-safety.js';

const NESTED_AGENTS_MAX_DEPTH = 12;
const NESTED_AGENTS_MAX_DIRECTORIES = 4096;
const NESTED_AGENTS_SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.sneakoscope',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out'
]);

export async function collectNestedProjectAgents(
  projectRoot: string,
  excludedRoots: Set<string>
): Promise<{ files: string[]; errorCount: number; truncated: boolean }> {
  const files: string[] = [];
  const queue: Array<{ directory: string; depth: number }> = [{ directory: projectRoot, depth: 0 }];
  const excluded = new Set([...excludedRoots].map((root) => path.resolve(root)));
  let cursor = 0;
  let errorCount = 0;
  let truncated = false;

  while (cursor < queue.length) {
    if (cursor >= NESTED_AGENTS_MAX_DIRECTORIES) {
      truncated = true;
      break;
    }
    const current = queue[cursor++]!;
    const inspection = await inspectConfinedPath(projectRoot, current.directory).catch(() => null);
    if (!inspection) {
      errorCount += 1;
      continue;
    }
    if (!inspection.exists || inspection.leafSymlink || !inspection.stat?.isDirectory()) continue;

    let entries: Dirent[];
    try {
      entries = await fsp.readdir(current.directory, { withFileTypes: true, encoding: 'utf8' });
    } catch {
      errorCount += 1;
      continue;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const target = path.join(current.directory, entry.name);
      if (current.depth > 0 && entry.name === 'AGENTS.md' && entry.isFile()) files.push(target);
      if (!entry.isDirectory()) continue;
      if (NESTED_AGENTS_SKIPPED_DIRECTORIES.has(entry.name.toLowerCase())) continue;
      if (excluded.has(path.resolve(target))) continue;
      if (current.depth >= NESTED_AGENTS_MAX_DEPTH) {
        truncated = true;
        continue;
      }
      if (queue.length >= NESTED_AGENTS_MAX_DIRECTORIES) {
        truncated = true;
        continue;
      }
      queue.push({ directory: target, depth: current.depth + 1 });
    }
  }

  return { files, errorCount, truncated };
}
