import test from 'node:test'
import assert from 'node:assert/strict'
import { runParallelProductionSmoke } from '../parallel-write-fixture.js'

test('production parallel smoke uses real git worktrees and proves cleanup', async () => {
  const report = await runParallelProductionSmoke()

  assert.equal(report.schema, 'sks.parallel-production-smoke.v1')
  assert.equal(report.ok, true, report.blockers.join(', '))
  assert.equal(report.mock_only, false)
  assert.equal(report.worker_count, 3)
  assert.deepEqual(report.changed_files, ['src/a.ts', 'src/b.ts', 'src/c.ts'])
  assert.equal(Object.keys(report.changed_files_by_worker).length, 3)
  assert.equal(report.distributed_across_workers, true)
  assert.equal(report.timestamp_overlap, true)
  assert.ok(report.overlap_windows.length >= 1)
  assert.equal(report.patch_envelope_count, 3)
  assert.equal(report.parent_merge_artifact.ok, true)
  assert.equal(report.parent_merge_artifact.shared_untouched, true)
  assert.equal(report.typecheck.ok, true, report.typecheck.stderr_tail)
  assert.equal(report.worktree_cleanup.ok, true)
  assert.equal(report.worktree_cleanup.worker_worktrees_removed, true)
  assert.equal(report.worktree_cleanup.worker_branches_removed, true)
  assert.equal(report.worktree_cleanup.parent_dirty_after_cleanup, false)
  assert.equal(report.worktree_cleanup.tmp_removed, true)
  assert.equal(report.blockers.includes('parallel_write_changed_files_below_target'), false)
})

test('production parallel smoke survives an injected worker failure', async () => {
  const report = await runParallelProductionSmoke({ injectFailure: true })

  assert.equal(report.ok, true, report.blockers.join(', '))
  assert.equal(report.failure_injection.requested, true)
  assert.equal(report.failure_injection.failed_worker_id, 'worker-fail')
  assert.equal(report.failure_injection.failed_workers.includes('worker-fail'), true)
  assert.equal(report.failure_injection.scheduler_survived, true)
  assert.equal(report.failure_injection.successful_workers.length, 3)
  assert.deepEqual(report.changed_files, ['src/a.ts', 'src/b.ts', 'src/c.ts'])
  assert.equal(report.parent_merge_artifact.shared_untouched, true)
  assert.equal(report.worktree_cleanup.ok, true)
})
