#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'
import { makeGitFixture, makeNonGitFixture } from './lib/git-worktree-fixture.js'

const capabilityMod = await importDist('core/git/git-worktree-capability.js')
const nonGit = makeNonGitFixture('worktree-capability-non-git')
process.env.SKS_WORKTREE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-wt-capability-'))
delete process.env.SKS_ALLOW_IN_REPO_WORKTREES
const nonGitCapability = await capabilityMod.evaluateGitWorktreeCapability({ root: nonGit, missionId: 'M-non-git' })
assertGate(nonGitCapability.mode === 'patch-envelope-only', 'non-Git projects must degrade to patch-envelope-only', nonGitCapability)
assertGate(nonGitCapability.worktree_probe_attempted === false, 'non-Git projects must not probe git worktree', nonGitCapability)

const repo = makeGitFixture('worktree-capability-git')
const gitCapability = await capabilityMod.evaluateGitWorktreeCapability({ root: repo, missionId: 'M-git' })
assertGate(gitCapability.ok === true && gitCapability.mode === 'git-worktree', 'Git fixture must support worktree mode', gitCapability)
assertGate(gitCapability.root_resolution?.in_repo === false, 'default worktree root must be outside main repo', gitCapability.root_resolution)

process.env.SKS_WORKTREE_ROOT = path.join(repo, '.sneakoscope', 'worktrees')
const blocked = await capabilityMod.evaluateGitWorktreeCapability({ root: repo, missionId: 'M-in-repo' })
assertGate(blocked.ok === false && blocked.blockers.includes('git_worktree_root_inside_repo_blocked'), 'in-repo worktree root must be blocked by default', blocked)

emitGate('git:worktree-capability', {
  non_git_mode: nonGitCapability.mode,
  git_mode: gitCapability.mode,
  in_repo_blocked: true
})
