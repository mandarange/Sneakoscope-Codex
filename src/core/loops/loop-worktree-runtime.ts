import path from 'node:path';
import { exists, nowIso, writeJsonAtomic } from '../fsx.js';
import { allocateWorkerWorktree } from '../git/git-worktree-manager.js';
import { gitOutputLine, runGitCommand } from '../git/git-worktree-runner.js';
import type { SksLoopNode, SksLoopOwnerScope, SksLoopPlan } from './loop-schema.js';
import { loopNodeRoot } from './loop-artifacts.js';

export interface LoopWorktreeRecord {
  schema: 'sks.loop-worktree.v1';
  loop_id: string;
  worktree_id: string | null;
  path: string | null;
  branch: string | null;
  base_ref: string | null;
  allocated_at: string;
  cleanup_policy: string;
  blockers: string[];
}

export interface LoopDiffSummary {
  changed_files: string[];
  patch_bytes: number;
  diff_stat: string;
  blockers: string[];
}

export async function allocateLoopWorktree(input: {
  root: string;
  plan: SksLoopPlan;
  node: SksLoopNode;
  noMutation?: boolean;
}): Promise<LoopWorktreeRecord> {
  const blockers: string[] = [];
  let worktreeId: string | null = null;
  let worktreePath: string | null = null;
  let branch: string | null = null;
  let baseRef: string | null = null;
  if (input.node.worktree.required && !input.noMutation) {
    const gitPresent = await exists(path.join(input.root, '.git'));
    if (!gitPresent) {
      blockers.push('loop_worktree_required_but_git_missing');
    } else {
      const allocation = await allocateWorkerWorktree({
        repoRoot: input.root,
        missionId: input.plan.mission_id,
        workerId: input.node.loop_id,
        slotId: input.node.loop_id,
        generationIndex: 1,
        branchPrefix: input.node.worktree.branch_prefix
      }).catch((err: unknown) => ({ ok: false, blockers: [`loop_worktree_allocate_exception:${err instanceof Error ? err.message : String(err)}`] }));
      if ((allocation as any).ok) {
        worktreeId = (allocation as any).worker_id || input.node.loop_id;
        worktreePath = (allocation as any).worktree_path || null;
        branch = (allocation as any).branch || null;
        baseRef = (allocation as any).base_ref || null;
      } else {
        blockers.push(...stringArray((allocation as any).blockers));
      }
    }
  }
  const record: LoopWorktreeRecord = {
    schema: 'sks.loop-worktree.v1',
    loop_id: input.node.loop_id,
    worktree_id: worktreeId,
    path: worktreePath,
    branch,
    base_ref: baseRef,
    allocated_at: nowIso(),
    cleanup_policy: input.node.worktree.cleanup,
    blockers
  };
  await writeJsonAtomic(path.join(loopNodeRoot(input.root, input.plan.mission_id, input.node.loop_id), 'worktree.json'), record);
  return record;
}

export async function computeLoopDiff(input: {
  root: string;
  worktreePath?: string | null;
  ownerScope: SksLoopOwnerScope;
}): Promise<LoopDiffSummary> {
  const cwd = input.worktreePath || input.root;
  const blockers: string[] = [];
  const names = await runGitCommand(cwd, ['diff', '--name-only', 'HEAD'], { timeoutMs: 30000 }).catch(() => null);
  const stat = await runGitCommand(cwd, ['diff', '--stat', 'HEAD'], { timeoutMs: 30000 }).catch(() => null);
  const diff = await runGitCommand(cwd, ['diff', '--binary', '--full-index', 'HEAD'], { timeoutMs: 60000 }).catch(() => null);
  if (!names?.ok) blockers.push('loop_git_diff_name_only_failed');
  if (!diff?.ok) blockers.push('loop_git_diff_failed');
  const changedFiles = [...new Set((names?.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
  blockers.push(...enforceLoopOwnerScope(changedFiles, input.ownerScope));
  return {
    changed_files: changedFiles,
    patch_bytes: Buffer.byteLength(diff?.stdout || ''),
    diff_stat: stat ? gitOutputLine(stat) || stat.stdout.slice(-4000) : '',
    blockers: [...new Set(blockers)]
  };
}

export function enforceLoopOwnerScope(changedFiles: string[], ownerScope: SksLoopOwnerScope): string[] {
  const blockers: string[] = [];
  for (const file of changedFiles) {
    if (!isInOwnerScope(file, ownerScope)) blockers.push(`loop_owner_scope_violation:${file}`);
  }
  return blockers;
}

function isInOwnerScope(file: string, ownerScope: SksLoopOwnerScope): boolean {
  const normalized = normalizePath(file);
  if (ownerScope.files.map(normalizePath).includes(normalized)) return true;
  return ownerScope.directories.map(normalizePath).some((dir) => normalized === dir || normalized.startsWith(`${dir}/`));
}

function normalizePath(value: string): string {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}
