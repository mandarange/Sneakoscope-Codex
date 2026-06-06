#!/usr/bin/env node
// @ts-nocheck
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'
import { ensureDistFresh } from './lib/ensure-dist-fresh.js'
import fs from 'node:fs'

const requireReal = process.env.SKS_REQUIRE_ZELLIJ === '1' || process.argv.includes('--require-real')
const freshness = ensureDistFresh({ rebuild: false })
assertGate(freshness.ok === true, 'dist must be fresh for zellij dashboard pane check', freshness)
const managerSource = fs.readFileSync(path.join(root, 'src', 'core', 'zellij', 'zellij-right-column-manager.ts'), 'utf8')
const narutoSource = fs.readFileSync(path.join(root, 'src', 'core', 'commands', 'naruto-command.ts'), 'utf8')
const madSource = fs.readFileSync(path.join(root, 'src', 'core', 'commands', 'mad-sks-command.ts'), 'utf8')
assertGate(managerSource.includes('openZellijDashboardPane') && narutoSource.includes("dashboard_created: false") && madSource.includes("dashboard_created: false"), 'Dashboard pane must be created by right-column manager after first worker spawn, not at launch', {
  manager: managerSource.includes('openZellijDashboardPane'),
  naruto_initial_dashboard_false: narutoSource.includes("dashboard_created: false"),
  mad_initial_dashboard_false: madSource.includes("dashboard_created: false")
})
const dashboard = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-dashboard-pane.js')).href)
const command = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-command.js')).href)
const missionId = `M-zellij-dashboard-${Date.now()}`
const sessionName = `sks-dashboard-${process.pid}`

if (!requireReal) {
  const snapshotMod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-dashboard-renderer.js')).href)
  const snapshot = snapshotMod.buildZellijDashboardSnapshot({ mission_id: missionId, active_workers: 4, visible_panes: 2, headless_workers: 2 })
  const text = snapshotMod.renderZellijDashboardText(snapshot)
  assertGate(text.includes('Mission') && text.includes('Backend counts') && text.includes('headless') && text.includes('GPT final status') && text.includes('Patch / verify'), 'dashboard renderer must include required fields', { text })
  assertGate(
    fs.readFileSync(path.join(root, 'src', 'scripts', 'zellij-dashboard-watch.ts'), 'utf8').includes('--interval-ms')
      && fs.existsSync(path.join(root, 'dist', 'scripts', 'zellij-dashboard-watch.js')),
    'dashboard watch script must support interval updates'
  )
  emitGate('zellij:dashboard-pane', { real_required: false, renderer_fields: true })
  process.exit(0)
}

await command.runZellij(['kill-session', sessionName], { cwd: root, timeoutMs: 5000, optional: true })
try {
  const record = await dashboard.openZellijDashboardPane({
    root,
    missionId,
    sessionName,
    cwd: root,
    snapshot: {
      mode: 'naruto',
      backend_counts: { 'codex-sdk': 2, 'local-llm': 1 },
      placement_counts: { 'zellij-pane': 2, headless: 1 },
      active_workers: 3,
      visible_panes: 2,
      headless_workers: 1,
      queue_depth: 7,
      worktrees: { active: 2, completed: 1, retained: 0 },
      local_llm: { tps: 12, queue: 1 },
      gpt_final_status: 'pending',
      gate_progress: 'release: 8/12'
    }
  })
  const ok = record.ok === true && record.pane_kind === 'dashboard' && record.worker_pane === false && record.pane_id
    && String(record.command || '').includes('zellij-dashboard-watch.js')
    && String(record.command || '').includes('--interval-ms 1000')
  assertGate(ok, 'real Zellij dashboard pane must open and not count as worker pane', record)
  emitGate('zellij:dashboard-pane', {
    real_required: true,
    pane_id: record.pane_id,
    pane_kind: record.pane_kind,
    worker_pane: record.worker_pane,
    mission_id: missionId,
    session_name: sessionName
  })
} finally {
  await command.runZellij(['kill-session', sessionName], { cwd: root, timeoutMs: 5000, optional: true })
}
