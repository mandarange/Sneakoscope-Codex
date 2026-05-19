import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Dirent } from 'node:fs';
import { rel, runProcess } from '../fsx.js';
import { classifySksPath, defaultGitPolicy, readGitPolicy, type SksGitPolicy } from './git-policy.js';

export interface GitStatusSummary {
  schema: 'sks.git-status.v1';
  ok: boolean;
  git_root: string;
  tracked_shared_memory: string[];
  untracked_shared_candidates: string[];
  ignored_runtime_files: string[];
  generated_indexes: string[];
  unknown_sks_files: string[];
  porcelain: string[];
  warnings: string[];
}

export async function git(root: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return runProcess('git', args, { cwd: root, timeoutMs: 120000, maxOutputBytes: 512 * 1024 });
}

export async function gitRoot(root: string): Promise<string | null> {
  const result = await git(root, ['rev-parse', '--show-toplevel']);
  return result.code === 0 ? result.stdout.trim() : null;
}

export async function gitStatusSummary(root: string, policy?: SksGitPolicy): Promise<GitStatusSummary> {
  const effectivePolicy = policy || await readGitPolicy(root);
  const actualRoot = await gitRoot(root);
  const warnings: string[] = [];
  if (!actualRoot) {
    return {
      schema: 'sks.git-status.v1',
      ok: false,
      git_root: root,
      tracked_shared_memory: [],
      untracked_shared_candidates: [],
      ignored_runtime_files: [],
      generated_indexes: [],
      unknown_sks_files: [],
      porcelain: [],
      warnings: ['not_git_repo']
    };
  }
  const status = await git(actualRoot, ['status', '--short', '--untracked-files=all']);
  const porcelain = status.stdout.split(/\r?\n/).filter(Boolean);
  const tracked = await trackedFiles(actualRoot);
  const ignored = await ignoredFiles(actualRoot);
  const trackedShared = tracked.filter((file) => classifySksPath(file, effectivePolicy) === 'shared_memory');
  const generatedIndexes = tracked.filter((file) => classifySksPath(file, effectivePolicy) === 'generated_index');
  const ignoredRuntime = ignored.filter((file) => classifySksPath(file, effectivePolicy) === 'local_runtime');
  const candidates = porcelain
    .filter((line) => line.startsWith('?? '))
    .map((line) => line.slice(3).trim())
    .filter((file) => classifySksPath(file, effectivePolicy) === 'shared_memory');
  const unknown = porcelain
    .map((line) => line.slice(3).trim())
    .filter((file) => classifySksPath(file, effectivePolicy) === 'unknown_sks');
  if (generatedIndexes.length) warnings.push('generated_indexes_tracked');
  return {
    schema: 'sks.git-status.v1',
    ok: status.code === 0,
    git_root: actualRoot,
    tracked_shared_memory: capList(trackedShared),
    untracked_shared_candidates: capList(candidates),
    ignored_runtime_files: capList(ignoredRuntime),
    generated_indexes: capList(generatedIndexes),
    unknown_sks_files: capList(unknown),
    porcelain: capList(porcelain, 120),
    warnings
  };
}

function capList(values: string[], max = 80): string[] {
  return values.length > max ? [...values.slice(0, max), `...${values.length - max}_more`] : values;
}

export async function isIgnored(root: string, relPath: string): Promise<boolean> {
  const result = await git(root, ['check-ignore', '-q', relPath]);
  return result.code === 0;
}

export async function trackedFiles(root: string): Promise<string[]> {
  const result = await git(root, ['ls-files', '-z']);
  if (result.code !== 0) return [];
  return result.stdout.split('\0').filter(Boolean);
}

export async function ignoredFiles(root: string): Promise<string[]> {
  const result = await git(root, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z']);
  if (result.code !== 0) return [];
  return result.stdout.split('\0').filter(Boolean);
}

export async function stagedFiles(root: string): Promise<string[]> {
  const result = await git(root, ['diff', '--cached', '--name-only', '-z']);
  if (result.code !== 0) return [];
  return result.stdout.split('\0').filter(Boolean);
}

export async function fileSize(root: string, relPath: string): Promise<number> {
  try {
    return (await fsp.stat(path.join(root, relPath))).size;
  } catch {
    return 0;
  }
}

export function gitStatusLinePath(line: string): string {
  return line.length > 3 ? line.slice(3).trim() : line.trim();
}

export async function listSharedFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: Dirent[] = [];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) out.push(rel(root, file));
    }
  }
  for (const dir of ['.sneakoscope/wiki/records', '.sneakoscope/wiki/wrongness', '.sneakoscope/wiki/image-voxels', '.sneakoscope/wiki/avoidance-rules']) {
    await walk(path.join(root, dir));
  }
  for (const file of ['.sneakoscope/git-policy.json', '.sneakoscope/shared-memory-manifest.json']) {
    try {
      await fsp.access(path.join(root, file));
      out.push(file);
    } catch {}
  }
  return out.sort();
}

export function defaultStatusPolicy(): SksGitPolicy {
  return defaultGitPolicy();
}
