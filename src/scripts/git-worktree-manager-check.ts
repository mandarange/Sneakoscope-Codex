#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'
import { makeGitFixture, run } from './lib/git-worktree-fixture.js'

const managerMod = await importDist('core/git/git-worktree-manager.js')
const cleanupMod = await importDist('core/git/git-worktree-cleanup.js')
const repo = makeGitFixture('worktree-manager')
process.env.SKS_WORKTREE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-wt-manager-'))
delete process.env.SKS_ALLOW_IN_REPO_WORKTREES

const allocation = await managerMod.allocateWorkerWorktree({
  repoRoot: repo,
  missionId: 'M-manager',
  workerId: 'worker-1',
  slotId: 'slot-001',
  generationIndex: 1
})
assertGate(allocation.ok === true, 'worker worktree allocation must pass', allocation)
assertGate(fs.existsSync(allocation.worktree_path), 'allocated worktree path must exist', allocation)
assertGate(!path.resolve(allocation.worktree_path).startsWith(path.resolve(repo) + path.sep), 'worktree must be outside main repo by default', allocation)
assertGate(fs.existsSync(allocation.manifest_path), 'worktree manifest must be written', allocation)
assertGate(run('git', ['status', '--porcelain=v1'], repo).trim() === '', 'main repo must stay clean after allocation')

const cleanup = await cleanupMod.cleanupGitWorktree({
  repoRoot: repo,
  worktreePath: allocation.worktree_path,
  branch: allocation.branch,
  deleteBranch: true
})
assertGate(cleanup.ok === true && cleanup.action === 'removed', 'clean worktree cleanup must remove allocation', cleanup)

emitGate('git:worktree-manager', {
  worktree_outside_repo: true,
  branch: allocation.branch,
  cleanup: cleanup.action
})
