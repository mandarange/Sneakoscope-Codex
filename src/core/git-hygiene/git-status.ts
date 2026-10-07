import fsp from 'node:fs/promises';
import path from 'node:path';
import { rel, runProcess } from '../fsx.js';
import { classifySksPath, readGitPolicy, type SksGitPolicy } from './git-policy.js';
import { inspectConfinedPath } from '../managed-path-safety.js';

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

export async function listSharedFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const pending: Array<{ file: string; depth: number }> = [];
  for (const dir of ['.sneakoscope/wiki/records', '.sneakoscope/wiki/wrongness', '.sneakoscope/wiki/image-voxels', '.sneakoscope/wiki/avoidance-rules', '.sneakoscope/wiki/summaries']) {
    pending.push({ file: path.join(root, dir), depth: 0 });
  }
  let visited = 0;
  while (pending.length) {
    const { file, depth } = pending.pop()!;
    if (++visited > 4096 || depth > 32) throw new Error('shared_memory_inventory_budget');
    const inspected = await inspectConfinedPath(root, file);
    if (!inspected.exists) continue;
    if (inspected.leafSymlink) throw new Error('shared_memory_symlink');
    if (inspected.stat?.isFile()) out.push(rel(root, file));
    else if (inspected.stat?.isDirectory()) {
      const children = await fsp.readdir(file);
      if (visited + pending.length + children.length > 4096) throw new Error('shared_memory_inventory_budget');
      for (const child of children.sort()) pending.push({ file: path.join(file, child), depth: depth + 1 });
    } else throw new Error('shared_memory_non_regular');
  }
  for (const file of ['.sneakoscope/git-policy.json', '.sneakoscope/shared-memory-manifest.json']) {
    const inspected = await inspectConfinedPath(root, path.join(root, file));
    if (!inspected.exists) continue;
    if (inspected.leafSymlink || !inspected.stat?.isFile()) throw new Error('shared_memory_policy_path');
    out.push(file);
  }
  return out.sort();
}
