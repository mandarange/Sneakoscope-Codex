#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'

const mad = fs.readFileSync(path.join(root, 'src/core/commands/mad-sks-command.ts'), 'utf8')
const naruto = fs.readFileSync(path.join(root, 'src/core/commands/naruto-command.ts'), 'utf8')
const launcher = fs.readFileSync(path.join(root, 'src/core/zellij/zellij-launcher.ts'), 'utf8')

const report = {
  schema: 'sks.zellij-initial-main-only-blackbox.v1',
  ok: true,
  mad_slot_zero: /launchMadZellijUi\([\s\S]*slotCount:\s*0/.test(mad),
  mad_no_launch_dashboard: !/launch\.dashboard_pane\s*=\s*await openZellijDashboardPane/.test(mad),
  mad_initial_ui_artifact: mad.includes('zellij-initial-ui.json') && mad.includes("dashboard_created: false"),
  naruto_slot_zero: /launchZellijLayout\([\s\S]*slotCount:\s*0/.test(naruto),
  naruto_no_launch_dashboard: !/liveZellij\.dashboard_pane\s*=\s*await openZellijDashboardPane/.test(naruto),
  naruto_initial_ui_artifact: naruto.includes('zellij-initial-ui.json') && naruto.includes("dashboard_created: false"),
  launcher_allows_zero: launcher.includes('slotCount: opts.slotCount || 1')
}
report.ok = report.mad_slot_zero
  && report.mad_no_launch_dashboard
  && report.mad_initial_ui_artifact
  && report.naruto_slot_zero
  && report.naruto_no_launch_dashboard
  && report.naruto_initial_ui_artifact

assertGate(report.ok, 'Zellij initial UI must be main-only with no dashboard/worker pane at launch', report)
emitGate('zellij:initial-main-only-blackbox', report)
