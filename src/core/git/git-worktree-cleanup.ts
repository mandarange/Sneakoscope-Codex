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

export interface GitWorktreeCleanupBatchReport {
  schema: 'sks.git-worktree-cleanup-batch.v1'
  ok: boolean
  generated_at: string
  requested_count: number
  max_parallel: number
  removed_count: number
  retained_dirty_count: number
  failed_count: number
  reports: GitWorktreeCleanupReport[]
  blockers: string[]
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

export async function cleanupGitWorktreesBatch(input: {
  worktrees: Array<{ repoRoot: string; worktreePath: string; branch?: string | null; deleteBranch?: boolean }>
  maxParallel?: number
}): Promise<GitWorktreeCleanupBatchReport> {
  const queue = [...(input.worktrees || [])]
  const maxParallel = Math.max(1, Math.floor(Number(input.maxParallel || queue.length || 1)))
  const reports: GitWorktreeCleanupReport[] = []
  const runners = Array.from({ length: Math.min(maxParallel, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift()
      if (!next) continue
      reports.push(await cleanupGitWorktree(next))
    }
  })
  await Promise.all(runners)
  const blockers = reports.flatMap((report) => report.blockers || [])
  return {
    schema: 'sks.git-worktree-cleanup-batch.v1',
    ok: blockers.length === 0,
    generated_at: nowIso(),
    requested_count: input.worktrees?.length || 0,
    max_parallel: maxParallel,
    removed_count: reports.filter((report) => report.action === 'removed').length,
    retained_dirty_count: reports.filter((report) => report.action === 'retained_dirty').length,
    failed_count: reports.filter((report) => report.action === 'remove_failed').length,
    reports,
    blockers
  }
}
