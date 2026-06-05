#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const workGraphMod = await importDist('core/naruto/naruto-work-graph.js')
const rolesMod = await importDist('core/naruto/naruto-role-policy.js')
const packMod = await importDist('core/naruto/naruto-gpt-final-pack.js')
const policy = {
  mode: 'git-worktree',
  required: true,
  main_repo_root: '/repo',
  worktree_root: '/cache/sks/worktrees/repo/M-final',
  fallback_reason: null
}
const graph = workGraphMod.buildNarutoWorkGraph({ requestedClones: 6, totalWorkItems: 8, writeCapable: true, worktreePolicy: policy })
const roleDistribution = rolesMod.buildNarutoRoleDistribution(graph.work_items)
const worktreeDiff = {
  schema: 'sks.git-worktree-diff.v1',
  ok: true,
  mission_id: 'M-final',
  worker_id: 'worker-1',
  main_repo_root: '/repo',
  worktree_path: '/cache/wt/worker-1',
  branch: 'sks/M/worker-1',
  changed_files: ['src/a.ts'],
  diff: 'diff --git a/src/a.ts b/src/a.ts\n',
  diff_bytes: 37
}
const pack = packMod.buildNarutoGptFinalPack({
  missionId: 'M-final',
  graph,
  roleDistribution,
  changedFiles: ['src/a.ts'],
  worktreePolicy: policy,
  worktreeDiffs: [worktreeDiff],
  localLlmMetrics: { participated: true, final_status: 'draft_until_gpt_final' }
})

assertGate(pack.worktree_policy.mode === 'git-worktree', 'GPT final pack must include worktree policy', pack.worktree_policy)
assertGate(pack.worktree_diffs.length === 1, 'GPT final pack must include bounded worktree diffs', pack)
assertGate(pack.local_llm_metrics.final_status === 'draft_until_gpt_final', 'local LLM output must remain draft until GPT final', pack.local_llm_metrics)
assertGate(pack.bounded === true && pack.secrets_redacted === true, 'GPT final pack must stay bounded/redacted', pack)

emitGate('naruto:worktree-gpt-final', {
  worktree_mode: pack.worktree_policy.mode,
  worktree_diffs: pack.worktree_diffs.length
})
