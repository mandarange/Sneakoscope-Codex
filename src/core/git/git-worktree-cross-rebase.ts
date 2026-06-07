import { nowIso } from '../fsx.js'
import { gitBlocker, gitOutputLine, runGitCommand } from './git-worktree-runner.js'

export interface GitWorktreeCrossRebaseWorker {
  worker_id: string
  worktree_path: string
  branch?: string | null
  state: 'idle' | 'done' | 'failed' | 'running' | 'active' | 'blocked' | 'unknown'
}

export interface GitWorktreeCrossRebaseReport {
  schema: 'sks.git-worktree-cross-rebase.v1'
  ok: boolean
  generated_at: string
  integration_head: string
  applied_count: number
  skipped_count: number
  records: Array<{
    worker_id: string
    worktree_path: string
    state: string
    status: 'applied' | 'skipped' | 'failed'
    reason: string
    before_head: string | null
    after_head: string | null
    blockers: string[]
  }>
  blockers: string[]
}

export async function crossRebaseIdleWorktrees(input: {
  integrationHead: string
  workers: GitWorktreeCrossRebaseWorker[]
}) {
  const records: GitWorktreeCrossRebaseReport['records'] = []
  for (const worker of input.workers) {
    const before = await runGitCommand(worker.worktree_path, ['rev-parse', 'HEAD'])
    const beforeHead = before.ok ? gitOutputLine(before) : null
    if (!['idle', 'done', 'failed', 'unknown'].includes(worker.state)) {
      records.push(record(worker, 'skipped', 'worker_not_idle', beforeHead, beforeHead, []))
      continue
    }
    const status = await runGitCommand(worker.worktree_path, ['status', '--porcelain=v1', '--untracked-files=all'])
    if (!status.ok) {
      records.push(record(worker, 'failed', 'status_failed', beforeHead, beforeHead, [gitBlocker('git_worktree_cross_rebase_status_failed', status)]))
      continue
    }
    if (status.stdout.trim()) {
      records.push(record(worker, 'skipped', 'dirty_worktree_skipped', beforeHead, beforeHead, []))
      continue
    }
    const rebase = await runGitCommand(worker.worktree_path, ['rebase', input.integrationHead], { timeoutMs: 120000 })
    if (!rebase.ok) {
      await runGitCommand(worker.worktree_path, ['rebase', '--abort'], { timeoutMs: 30000 }).catch(() => null)
      records.push(record(worker, 'failed', 'rebase_failed', beforeHead, beforeHead, [gitBlocker('git_worktree_cross_rebase_failed', rebase)]))
      continue
    }
    const after = await runGitCommand(worker.worktree_path, ['rev-parse', 'HEAD'])
    records.push(record(worker, 'applied', 'rebased_to_integration_head', beforeHead, after.ok ? gitOutputLine(after) : null, []))
  }
  const blockers = records.flatMap((row) => row.blockers)
  return {
    schema: 'sks.git-worktree-cross-rebase.v1',
    ok: blockers.length === 0,
    generated_at: nowIso(),
    integration_head: input.integrationHead,
    applied_count: records.filter((row) => row.status === 'applied').length,
    skipped_count: records.filter((row) => row.status === 'skipped').length,
    records,
    blockers
  } satisfies GitWorktreeCrossRebaseReport
}

function record(worker: GitWorktreeCrossRebaseWorker, status: 'applied' | 'skipped' | 'failed', reason: string, beforeHead: string | null, afterHead: string | null, blockers: string[]) {
  return {
    worker_id: worker.worker_id,
    worktree_path: worker.worktree_path,
    state: worker.state,
    status,
    reason,
    before_head: beforeHead,
    after_head: afterHead,
    blockers
  }
}
