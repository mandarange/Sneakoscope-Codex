#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'

const uiMode = fs.readFileSync(path.join(root, 'src/core/zellij/zellij-ui-mode.ts'), 'utf8')
const manager = fs.readFileSync(path.join(root, 'src/core/zellij/zellij-right-column-manager.ts'), 'utf8')
const worker = fs.readFileSync(path.join(root, 'src/core/zellij/zellij-worker-pane-manager.ts'), 'utf8')
const swarm = fs.readFileSync(path.join(root, 'src/core/agents/native-cli-session-swarm.ts'), 'utf8')
const report = {
  schema: 'sks.zellij-slot-only-ui-check.v1',
  default_compact_slots: uiMode.includes("return 'compact-slots'"),
  state_records_ui_mode: manager.includes('ui_mode: uiMode'),
  compact_skips_dashboard: manager.includes('if (!createDashboard)') && manager.includes('dashboard_created: false'),
  first_slot_can_open_right: worker.includes("rightColumn?.focusPaneId ? 'down' : 'right'"),
  second_slot_down_only_with_focus: worker.includes("directionRequested === 'down' ? ['--near-current-pane'] : []"),
  compact_uses_renderer: swarm.includes('buildZellijSlotPaneCommand') && swarm.includes("slot_visualization = uiMode === 'full-debug' ? 'worker-command-pane' : 'zellij-slot-pane-renderer'")
}
const ok = Object.values(report).every((value) => value === true || typeof value === 'string')
assertGate(ok, 'Zellij default UI must be compact slot-only with opt-in dashboard', report)
emitGate('zellij:slot-only-ui', report)
