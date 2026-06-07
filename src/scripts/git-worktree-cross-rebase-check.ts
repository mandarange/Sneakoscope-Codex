#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
import { crossRebaseIdleWorktrees } from '../core/git/git-worktree-cross-rebase.js'
import { runGitCommand, gitOutputLine } from '../core/git/git-worktree-runner.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-worktree-cross-rebase-'))
await runGitCommand(root, ['init'])
await runGitCommand(root, ['config', 'user.email', 'sks@example.test'])
await runGitCommand(root, ['config', 'user.name', 'SKS Test'])
fs.writeFileSync(path.join(root, 'base.txt'), 'base\n')
await runGitCommand(root, ['add', 'base.txt'])
await runGitCommand(root, ['commit', '-m', 'base'])
const workerPath = path.join(root, '..', `worker-${process.pid}`)
await runGitCommand(root, ['worktree', 'add', workerPath, 'HEAD'])
fs.writeFileSync(path.join(root, 'integration.txt'), 'integration\n')
await runGitCommand(root, ['add', 'integration.txt'])
await runGitCommand(root, ['commit', '-m', 'integration'])
const head = gitOutputLine(await runGitCommand(root, ['rev-parse', 'HEAD']))
const report = await crossRebaseIdleWorktrees({
  integrationHead: head,
  workers: [{ worker_id: 'W1', worktree_path: workerPath, state: 'idle' }]
})
assertGate(report.ok && report.applied_count === 1, 'Idle worktrees must cross-rebase to the integration head', report)
emitGate('git:worktree-cross-rebase', report)
