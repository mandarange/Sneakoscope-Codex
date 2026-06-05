import { nowIso } from '../fsx.js'
import type { GitWorktreeDiff } from './git-worktree-diff.js'
import { runGitCommand } from './git-worktree-runner.js'
import { summarizeGitWorktreeConflict } from './git-worktree-conflict-resolver.js'

export interface GitWorktreeMergeQueueReport {
  schema: 'sks.git-worktree-merge-queue.v1'
  ok: boolean
  generated_at: string
  integration_worktree_path: string
  applied_count: number
  skipped_clean_count: number
  conflicts: unknown[]
  changed_files: string[]
  blockers: string[]
}

export async function applyGitWorktreeMergeQueue(input: {
  integrationWorktreePath: string
  diffs: GitWorktreeDiff[]
}): Promise<GitWorktreeMergeQueueReport> {
  const conflicts: unknown[] = []
  const changedFiles = new Set<string>()
  let appliedCount = 0
  let skippedCleanCount = 0
  for (const diff of input.diffs) {
    for (const file of diff.changed_files) changedFiles.add(file)
    if (diff.clean || !diff.diff.trim()) {
      skippedCleanCount += 1
      continue
    }
    const check = await runGitCommand(input.integrationWorktreePath, ['apply', '--3way', '--check', '-'], {
      input: diff.diff,
      timeoutMs: 30000
    })
    if (!check.ok) {
      conflicts.push(summarizeGitWorktreeConflict({
        workerId: diff.worker_id,
        changedFiles: diff.changed_files,
        stderr: check.stderr || check.stdout
      }))
      continue
    }
    const apply = await runGitCommand(input.integrationWorktreePath, ['apply', '--3way', '-'], {
      input: diff.diff,
      timeoutMs: 30000
    })
    if (apply.ok) appliedCount += 1
    else {
      conflicts.push(summarizeGitWorktreeConflict({
        workerId: diff.worker_id,
        changedFiles: diff.changed_files,
        stderr: apply.stderr || apply.stdout
      }))
    }
  }
  const blockers = conflicts.length ? ['git_worktree_merge_queue_conflicts'] : []
  return {
    schema: 'sks.git-worktree-merge-queue.v1',
    ok: blockers.length === 0,
    generated_at: nowIso(),
    integration_worktree_path: input.integrationWorktreePath,
    applied_count: appliedCount,
    skipped_clean_count: skippedCleanCount,
    conflicts,
    changed_files: [...changedFiles],
    blockers
  }
}
