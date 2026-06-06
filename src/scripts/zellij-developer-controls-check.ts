#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'

const zellij = fs.readFileSync(path.join(root, 'src/commands/zellij.ts'), 'utf8')
const naruto = fs.readFileSync(path.join(root, 'src/core/commands/naruto-command.ts'), 'utf8')
const report = {
  schema: 'sks.zellij-developer-controls-check.v1',
  ok: true,
  zellij_controls: ['focus-worker', 'worker-logs', 'dashboard', 'close-drained'].every((token) => zellij.includes(token)),
  naruto_controls: ['dashboard', 'workers'].every((token) => naruto.includes(`'${token}'`)),
  dashboard_watch: zellij.includes('--watch') && zellij.includes('renderZellijDashboardText'),
  focus_uses_pane_id: zellij.includes('focus-pane-id'),
  logs_read_swarm: zellij.includes('agent-native-cli-session-swarm.json')
}
report.ok = report.zellij_controls && report.naruto_controls && report.dashboard_watch && report.focus_uses_pane_id && report.logs_read_swarm
assertGate(report.ok, 'Zellij/Naruto developer controls missing', report)
emitGate('zellij:developer-controls', report)
