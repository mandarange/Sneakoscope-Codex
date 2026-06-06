import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { runGitCommand } from './git-worktree-runner.js'

export interface GitWorktreeCleanupReport {
  schema: 'sks.git-worktree-cleanup.v1'
  ok: boolean
  generated_at: string
  repo_root: string
  worktree_path: string
  branch: string | null
  clean: boolean
  action: 'removed' | 'retained_dirty' | 'remove_failed'
  retention_lock_path: string | null
  blockers: string[]
  git_locked?: boolean
  unlock_command?: string | null
  cleanup_command?: string | null
}

export async function cleanupGitWorktree(input: {
  repoRoot: string
  worktreePath: string
  branch?: string | null
  deleteBranch?: boolean
}): Promise<GitWorktreeCleanupReport> {
  const repoRoot = path.resolve(input.repoRoot)
  const worktreePath = path.resolve(input.worktreePath)
  const status = await runGitCommand(worktreePath, ['status', '--porcelain=v1', '--untracked-files=all'])
  const clean = status.ok && status.stdout.trim().length === 0
  if (!clean) {
    const reason = `SKS retained dirty failed worker ${path.basename(worktreePath)}`
    const lock = await runGitCommand(repoRoot, ['worktree', 'lock', '--reason', reason, worktreePath])
    const lockPath = `${worktreePath}.retained.json`
    await writeJsonAtomic(lockPath, {
      schema: 'sks.git-worktree-retention-lock.v1',
      generated_at: nowIso(),
      repo_root: repoRoot,
      worktree_path: worktreePath,
      branch: input.branch || null,
      reason: status.ok ? 'dirty_worktree_retained' : 'status_failed_retained',
      status_porcelain: status.stdout || null,
      git_locked: lock.ok,
      unlock_command: `git worktree unlock ${JSON.stringify(worktreePath)}`,
      cleanup_command: 'sks worktree cleanup --mission <id>'
    })
    return {
      schema: 'sks.git-worktree-cleanup.v1',
      ok: true,
      generated_at: nowIso(),
      repo_root: repoRoot,
      worktree_path: worktreePath,
      branch: input.branch || null,
      clean: false,
      action: 'retained_dirty',
      retention_lock_path: lockPath,
      blockers: lock.ok ? [] : ['git_worktree_lock_failed'],
      git_locked: lock.ok,
      unlock_command: `git worktree unlock ${JSON.stringify(worktreePath)}`,
      cleanup_command: 'sks worktree cleanup --mission <id>'
    }
  }

  const remove = await runGitCommand(repoRoot, ['worktree', 'remove', worktreePath])
  const blockers = remove.ok ? [] : ['git_worktree_remove_failed']
  if (remove.ok && input.deleteBranch === true && input.branch) {
    await runGitCommand(repoRoot, ['branch', '-D', input.branch])
  }
  return {
    schema: 'sks.git-worktree-cleanup.v1',
    ok: blockers.length === 0,
    generated_at: nowIso(),
    repo_root: repoRoot,
    worktree_path: worktreePath,
    branch: input.branch || null,
    clean: true,
    action: remove.ok ? 'removed' : 'remove_failed',
    retention_lock_path: null,
    blockers,
    git_locked: false,
    unlock_command: null,
    cleanup_command: null
  }
}
