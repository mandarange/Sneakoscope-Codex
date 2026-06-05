export interface GitWorktreeConflictSummary {
  schema: 'sks.git-worktree-conflict.v1'
  ok: false
  worker_id: string
  changed_files: string[]
  stderr_tail: string
  conflict_markers_possible: boolean
  blockers: string[]
}

export function summarizeGitWorktreeConflict(input: {
  workerId: string
  changedFiles: string[]
  stderr: string
}): GitWorktreeConflictSummary {
  const stderr = String(input.stderr || '')
  return {
    schema: 'sks.git-worktree-conflict.v1',
    ok: false,
    worker_id: input.workerId,
    changed_files: input.changedFiles,
    stderr_tail: stderr.slice(-4000),
    conflict_markers_possible: /conflict|patch failed|does not apply/i.test(stderr),
    blockers: ['git_worktree_diff_apply_failed']
  }
}
