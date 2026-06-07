import { nowIso } from '../fsx.js'
import type { GitWorktreeDiff } from './git-worktree-diff.js'
import type { GitWorktreeCheckpointReport } from './git-worktree-checkpoint.js'
import { runGitCommand } from './git-worktree-runner.js'
import { summarizeGitWorktreeConflict } from './git-worktree-conflict-resolver.js'

export interface GitWorktreeMergeQueueReport {
  schema: 'sks.git-worktree-merge-queue.v1'
  ok: boolean
  generated_at: string
  integration_worktree_path: string
  applied_count: number
  checkpoint_commit_count: number
  skipped_clean_count: number
  conflicts: unknown[]
  strategy_results: unknown[]
  changed_files: string[]
  blockers: string[]
}

export async function applyGitWorktreeMergeQueue(input: {
  integrationWorktreePath: string
  diffs: GitWorktreeDiff[]
  checkpoints?: GitWorktreeCheckpointReport[]
}): Promise<GitWorktreeMergeQueueReport> {
  const conflicts: unknown[] = []
  const strategyResults: unknown[] = []
  const changedFiles = new Set<string>()
  let appliedCount = 0
  let skippedCleanCount = 0
  let checkpointCommitCount = 0
  for (const checkpoint of input.checkpoints || []) {
    for (const file of checkpoint.changed_files || []) changedFiles.add(file)
    if (checkpoint.mode_applied !== 'checkpoint-commit' || !checkpoint.commit_hash) continue
    checkpointCommitCount += 1
    const merged = await applyCheckpointCommit(input.integrationWorktreePath, checkpoint)
    strategyResults.push(merged)
    if (merged.ok) appliedCount += 1
    else conflicts.push({
      worker_id: checkpoint.worker_id,
      changed_files: checkpoint.changed_files,
      strategy: 'checkpoint-commit',
      blockers: merged.blockers,
      conflict_files: merged.conflict_files
    })
  }
  for (const diff of input.diffs) {
    if ((input.checkpoints || []).some((checkpoint) => checkpoint.worker_id === diff.worker_id && checkpoint.mode_applied === 'checkpoint-commit' && checkpoint.commit_hash)) {
      skippedCleanCount += 1
      continue
    }
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
    if (apply.ok) {
      appliedCount += 1
      strategyResults.push({
        ok: true,
        worker_id: diff.worker_id,
        strategy: 'diff-apply-3way',
        commit_hash: null,
        conflict_files: [],
        changed_files: diff.changed_files,
        blockers: []
      })
    }
    else {
      const conflict = summarizeGitWorktreeConflict({
        workerId: diff.worker_id,
        changedFiles: diff.changed_files,
        stderr: apply.stderr || apply.stdout
      })
      strategyResults.push({
        ok: false,
        worker_id: diff.worker_id,
        strategy: 'diff-apply-3way',
        commit_hash: null,
        conflict_files: (conflict as any).conflict_files || diff.changed_files,
        changed_files: diff.changed_files,
        blockers: (conflict as any).blockers || ['git_worktree_diff_apply_failed']
      })
      conflicts.push(conflict)
    }
  }
  const blockers = conflicts.length ? ['git_worktree_merge_queue_conflicts'] : []
  return {
    schema: 'sks.git-worktree-merge-queue.v1',
    ok: blockers.length === 0,
    generated_at: nowIso(),
    integration_worktree_path: input.integrationWorktreePath,
    applied_count: appliedCount,
    checkpoint_commit_count: checkpointCommitCount,
    skipped_clean_count: skippedCleanCount,
    conflicts,
    strategy_results: strategyResults,
    changed_files: [...changedFiles],
    blockers
  }
}

async function applyCheckpointCommit(integrationWorktreePath: string, checkpoint: GitWorktreeCheckpointReport) {
  const cherryPick = await runGitCommand(integrationWorktreePath, ['cherry-pick', '--allow-empty', '-X', 'theirs', checkpoint.commit_hash || ''], {
    timeoutMs: 120000
  })
  if (cherryPick.ok) {
    return {
      ok: true,
      worker_id: checkpoint.worker_id,
      strategy: 'checkpoint-cherry-pick',
      commit_hash: checkpoint.commit_hash,
      conflict_files: [],
      blockers: []
    }
  }
  await runGitCommand(integrationWorktreePath, ['cherry-pick', '--abort'], { timeoutMs: 30000 }).catch(() => null)
  const merge = await runGitCommand(integrationWorktreePath, ['merge', '--no-ff', '--no-edit', '-X', 'theirs', checkpoint.commit_hash || ''], {
    timeoutMs: 120000
  })
  if (merge.ok) {
    return {
      ok: true,
      worker_id: checkpoint.worker_id,
      strategy: 'checkpoint-merge',
      commit_hash: checkpoint.commit_hash,
      conflict_files: [],
      blockers: []
    }
  }
  const conflictFiles = await runGitCommand(integrationWorktreePath, ['diff', '--name-only', '--diff-filter=U'], { timeoutMs: 30000 }).catch(() => null)
  await runGitCommand(integrationWorktreePath, ['merge', '--abort'], { timeoutMs: 30000 }).catch(() => null)
  return {
    ok: false,
    worker_id: checkpoint.worker_id,
    strategy: 'checkpoint-cherry-pick-then-merge',
    commit_hash: checkpoint.commit_hash,
    conflict_files: String(conflictFiles?.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    blockers: [
      `git_worktree_checkpoint_cherry_pick_failed:${cherryPick.stderr_tail || cherryPick.stdout_tail}`,
      `git_worktree_checkpoint_merge_failed:${merge.stderr_tail || merge.stdout_tail}`
    ]
  }
}
