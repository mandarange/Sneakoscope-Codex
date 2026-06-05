#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const dashboardMod = await importDist('core/zellij/zellij-naruto-dashboard.js')
const plan = dashboardMod.planNarutoZellijDashboard({
  targetActiveWorkers: 32,
  visiblePaneCap: 12,
  completed: 8,
  failed: 1,
  backpressure: 'normal',
  roles: ['implementer', 'modifier', 'test_writer', 'verifier'],
  backend: 'codex-sdk'
})

assertGate(plan.ok === true, 'Naruto Zellij dashboard plan must pass', plan)
assertGate(plan.visible_worker_panes === 12, 'targetActiveWorkers=32 and visiblePaneCap=12 must create 12 visible panes', plan)
assertGate(plan.headless_workers === 20, 'remaining active workers must be listed as headless', plan)
assertGate(plan.pane_titles.every((title) => /slot-\d+\/gen-1 · .+ · codex-sdk · active/.test(title)), 'pane titles must include slot/gen/role/backend/status', plan)

emitGate('naruto:zellij-massive-ui', {
  visible_worker_panes: plan.visible_worker_panes,
  headless_workers: plan.headless_workers,
  dashboard: plan.dashboard
})

