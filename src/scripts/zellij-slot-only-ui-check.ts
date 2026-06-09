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
  worker_panes_default_live: uiMode.includes('resolveZellijWorkerPaneUiMode') && uiMode.includes("|| 'full-debug'"),
  compact_explicit_fallback: uiMode.includes("'--zellij-compact-slots'") && uiMode.includes("fromEnv === 'compact-slots'"),
  state_records_ui_mode: manager.includes('ui_mode: uiMode'),
  compact_skips_dashboard: manager.includes('if (!createDashboard)') && manager.includes('dashboard_created: false'),
  first_slot_creates_slot_anchor_right: worker.includes('buildZellijSlotColumnAnchorCommand') && worker.includes("'--direction', 'right', '--name', 'SLOTS'"),
  workers_stack_down_from_anchor: worker.includes("const directionRequested: 'right' | 'down' = 'down'")
    && worker.includes("directionRequested === 'down' ? ['--near-current-pane'] : []")
    && worker.includes('slot_column_anchor_pane_id'),
  explicit_compact_uses_renderer: swarm.includes('buildZellijSlotPaneCommand') && swarm.includes("liveWorkerPane ? 'worker-command-pane' : 'zellij-slot-pane-renderer'")
    && swarm.includes('paneRecord.pane_kind')
    && swarm.includes('paneRecord.scaling_primitive')
}
const ok = Object.values(report).every((value) => value === true || typeof value === 'string')
assertGate(ok, 'Zellij default UI must be compact slot-only with opt-in dashboard', report)
emitGate('zellij:slot-only-ui', report)
