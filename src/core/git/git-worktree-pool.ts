import { nowIso } from '../fsx.js'

export interface GitWorktreePoolPlan {
  schema: 'sks.git-worktree-pool.v1'
  ok: boolean
  generated_at: string
  requested_workers: number
  reusable_count: number
  allocate_count: number
  assignments: Array<{ worker_id: string; action: 'reuse' | 'allocate'; worktree_path: string | null }>
  blockers: string[]
}

export function planGitWorktreePool(input: {
  workerIds: string[]
  reusableWorktrees?: string[]
}): GitWorktreePoolPlan {
  const reusable = [...(input.reusableWorktrees || [])]
  const assignments = input.workerIds.map((workerId) => {
    const worktree = reusable.shift() || null
    return {
      worker_id: workerId,
      action: worktree ? 'reuse' as const : 'allocate' as const,
      worktree_path: worktree
    }
  })
  return {
    schema: 'sks.git-worktree-pool.v1',
    ok: true,
    generated_at: nowIso(),
    requested_workers: input.workerIds.length,
    reusable_count: (input.reusableWorktrees || []).length,
    allocate_count: assignments.filter((row) => row.action === 'allocate').length,
    assignments,
    blockers: []
  }
}
