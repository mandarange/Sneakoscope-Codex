#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'

const orchestrator = fs.readFileSync(path.join(root, 'src/core/agents/agent-orchestrator.ts'), 'utf8')
const report = {
  schema: 'sks.git-worktree-integration-primary-runtime-check.v1',
  splits_worktree_entries: orchestrator.includes("entry.envelope?.source === 'git-worktree-diff'"),
  uses_integration_worktree: orchestrator.includes('createGitIntegrationWorktree'),
  uses_merge_queue: orchestrator.includes('applyGitWorktreeMergeQueue'),
  applies_to_main_repo: orchestrator.includes('main_repo_apply') && orchestrator.includes('integrationWorktreePath: repoRoot'),
  rollback_evidence: orchestrator.includes('rollback_evidence') && orchestrator.includes('captureGitWorktreeRollbackPlan') && orchestrator.includes('completeGitWorktreeRollbackPlan'),
  bypasses_normal_apply: orchestrator.includes('const normalEntries') && orchestrator.includes('applyAgentPatchQueueEntry(root, entry') && orchestrator.includes('parallelEntries = disjointEntries'),
  writes_report: orchestrator.includes('git-worktree-merge-queue-report.json')
}
const ok = report.splits_worktree_entries && report.uses_integration_worktree && report.uses_merge_queue && report.applies_to_main_repo && report.rollback_evidence && report.bypasses_normal_apply && report.writes_report
assertGate(ok, 'git-worktree-diff entries must use integration merge queue primary path', report)
emitGate('git:worktree-integration-primary-runtime', report)
