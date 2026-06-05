#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const policyMod = await importDist('core/git/git-worktree-cache-policy.js')
const now = Date.now()
const entries = Array.from({ length: 1000 }, (_, index) => ({
  path: `/tmp/wt-${index}`,
  updated_at_ms: now - index * 60000,
  bytes: 1024 * (index + 1),
  dirty: index % 137 === 0
}))
const start = Date.now()
const plan = policyMod.planGitWorktreeCachePolicy({ entries, nowMs: now, maxEntries: 120, maxBytes: 40 * 1024 * 1024, ttlMs: 2 * 60 * 60 * 1000 })
const elapsed = Date.now() - start

assertGate(plan.ok === true, 'cache policy plan must pass', plan)
assertGate(plan.keep.length <= 120 || plan.dirty_retained.length > 0, 'cache policy must bound retained clean entries', plan)
assertGate(plan.dirty_retained.length > 0, 'dirty entries must be retained by cache policy', plan)
assertGate(elapsed < 250, 'cache policy must stay fast on 1000 entries', { elapsed })

emitGate('git:worktree-cache-performance', {
  elapsed_ms: elapsed,
  keep: plan.keep.length,
  prune: plan.prune.length,
  dirty_retained: plan.dirty_retained.length
})
