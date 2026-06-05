#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const dashboardMod = await importDist('core/zellij/zellij-naruto-dashboard.js')
const plan = dashboardMod.planNarutoZellijDashboard({
  targetActiveWorkers: 10,
  visiblePaneCap: 6,
  roles: ['implementer', 'verifier'],
  backend: 'codex-sdk',
  worktreePolicy: {
    mode: 'git-worktree',
    required: true,
    main_repo_root: '/repo',
    worktree_root: '/cache/sks/worktrees/repo/M',
    fallback_reason: null
  }
})

assertGate(plan.ok === true, 'Naruto worktree Zellij dashboard must pass', plan)
assertGate(plan.worktree_mode === 'git-worktree', 'dashboard must carry worktree mode', plan)
assertGate(plan.worktree_labels.length === plan.visible_worker_panes, 'visible panes must have worktree labels', plan)
assertGate(plan.pane_titles.every((title) => title.includes('WT:') && title.includes('branch:')), 'pane titles must include worktree id and branch', plan.pane_titles)
assertGate(plan.headless_workers === 4, 'dashboard must still expose headless worker count', plan)

emitGate('naruto:worktree-zellij-ui', {
  visible_worker_panes: plan.visible_worker_panes,
  headless_workers: plan.headless_workers,
  sample_title: plan.pane_titles[0]
})
