#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'
import { makeGitFixture, makeNonGitFixture } from './lib/git-worktree-fixture.js'

const capabilityMod = await importDist('core/git/git-worktree-capability.js')
const workGraphMod = await importDist('core/naruto/naruto-work-graph.js')
const activePoolMod = await importDist('core/naruto/naruto-active-pool.js')
const governorMod = await importDist('core/naruto/naruto-concurrency-governor.js')
const repo = makeGitFixture('naruto-worktree-coding')
process.env.SKS_WORKTREE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-naruto-wt-'))
const capability = await capabilityMod.evaluateGitWorktreeCapability({ root: repo, missionId: 'M-naruto-wt', requireGitWorktree: process.argv.includes('--require-real') })
const policy = {
  mode: capability.mode,
  required: capability.mode === 'git-worktree',
  main_repo_root: capability.detection.root,
  worktree_root: capability.root_resolution?.root || null,
  fallback_reason: capability.mode === 'git-worktree' ? null : capability.blockers.join(';')
}
const graph = workGraphMod.buildNarutoWorkGraph({
  requestedClones: 8,
  totalWorkItems: 12,
  writeCapable: true,
  targetPaths: Array.from({ length: 12 }, (_, index) => `src/wt-${index}.ts`),
  maxActiveWorkers: 4,
  worktreePolicy: policy
})
const governor = governorMod.decideNarutoConcurrency({ requestedClones: 8, totalWorkItems: 12, pendingWorkQueueSize: 12, backend: 'fake' })
const pool = await activePoolMod.runNarutoActivePool({ graph, governor: { ...governor, safe_active_workers: 4 } })

assertGate(capability.ok === true && capability.mode === 'git-worktree', 'Git Naruto coding fixture must use git-worktree mode', capability)
assertGate(graph.worktree_policy.mode === 'git-worktree', 'Naruto work graph must carry git-worktree policy', graph.worktree_policy)
assertGate(graph.work_items.filter((item) => item.write_allowed).every((item) => item.worktree?.allocation_required === true), 'write-capable work items must require worktree allocation', graph.work_items)
assertGate(pool.worktree_allocation_required_count > 0, 'active pool must plan worktree allocations for write work', pool)

const nonGit = makeNonGitFixture('naruto-worktree-non-git')
const nonGitCapability = await capabilityMod.evaluateGitWorktreeCapability({ root: nonGit, missionId: 'M-naruto-non-git' })
assertGate(nonGitCapability.mode === 'patch-envelope-only' && nonGitCapability.worktree_probe_attempted === false, 'non-Git Naruto must degrade without worktree probe', nonGitCapability)

emitGate('naruto:worktree-coding', {
  worktree_mode: graph.worktree_policy.mode,
  allocation_required_count: pool.worktree_allocation_required_count,
  non_git_mode: nonGitCapability.mode
})
