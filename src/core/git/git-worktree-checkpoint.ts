import { nowIso } from '../fsx.js'
import { gitBlocker, gitOutputLine, runGitCommand } from './git-worktree-runner.js'

export type GitWorktreeCheckpointMode = 'diff-envelope' | 'checkpoint-commit' | 'auto'

export interface GitWorktreeCheckpointReport {
  schema: 'sks.git-worktree-checkpoint.v1'
  ok: boolean
  generated_at: string
  worktree_path: string
  repo_root: string
  worker_id: string
  task_id: string
  mode_requested: GitWorktreeCheckpointMode
  mode_applied: 'noop' | 'diff-envelope' | 'checkpoint-commit'
  commit_hash: string | null
  changed_files: string[]
  blockers: string[]
}

export async function checkpointWorkerWorktree(input: {
  worktreePath: string
  repoRoot: string
  workerId: string
  taskId: string
  mode: GitWorktreeCheckpointMode
}): Promise<GitWorktreeCheckpointReport> {
  const status = await runGitCommand(input.worktreePath, ['status', '--porcelain=v1', '--untracked-files=all'])
  const names = await runGitCommand(input.worktreePath, ['diff', '--name-only', 'HEAD'])
  const untracked = await runGitCommand(input.worktreePath, ['ls-files', '--others', '--exclude-standard'])
  const changedFiles = [...new Set([...lines(names.stdout), ...lines(untracked.stdout), ...statusFiles(status.stdout)])]
  const blockers = [...(status.ok ? [] : [gitBlocker('git_worktree_status_failed', status)])]
  const requested = input.mode || 'auto'
  const commitMode = requested === 'checkpoint-commit' || (requested === 'auto' && changedFiles.length > 1)
  if (!changedFiles.length || blockers.length) {
    return report(input, requested, 'noop', null, changedFiles, blockers)
  }
  if (!commitMode) return report(input, requested, 'diff-envelope', null, changedFiles, blockers)
  const add = await runGitCommand(input.worktreePath, ['add', '-A'], { timeoutMs: 30000 })
  if (!add.ok) blockers.push(gitBlocker('git_worktree_checkpoint_add_failed', add))
  const commit = blockers.length ? null : await runGitCommand(input.worktreePath, ['commit', '--no-verify', '-m', `sks(worker): checkpoint ${input.workerId}/${input.taskId}`], { timeoutMs: 120000 })
  if (commit && !commit.ok) blockers.push(gitBlocker('git_worktree_checkpoint_commit_failed', commit))
  const head = blockers.length ? null : await runGitCommand(input.worktreePath, ['rev-parse', 'HEAD'])
  const hash = head?.ok ? gitOutputLine(head) : null
  return report(input, requested, blockers.length ? 'noop' : 'checkpoint-commit', hash, changedFiles, blockers)
}

function report(input: { worktreePath: string; repoRoot: string; workerId: string; taskId: string }, mode: GitWorktreeCheckpointMode, applied: GitWorktreeCheckpointReport['mode_applied'], commitHash: string | null, changedFiles: string[], blockers: string[]): GitWorktreeCheckpointReport {
  return {
    schema: 'sks.git-worktree-checkpoint.v1',
    ok: blockers.length === 0,
    generated_at: nowIso(),
    worktree_path: input.worktreePath,
    repo_root: input.repoRoot,
    worker_id: input.workerId,
    task_id: input.taskId,
    mode_requested: mode,
    mode_applied: applied,
    commit_hash: commitHash,
    changed_files: changedFiles,
    blockers
  }
}

function lines(text: string): string[] {
  return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function statusFiles(text: string): string[] {
  return lines(text).map((line) => {
    const match = line.match(/^.{2}\s+(.*)$/) || line.match(/^\S+\s+(.*)$/)
    const file = (match?.[1] || line).trim()
    return file.includes(' -> ') ? file.split(' -> ').pop()?.trim() || file : file
  }).filter(Boolean)
}
