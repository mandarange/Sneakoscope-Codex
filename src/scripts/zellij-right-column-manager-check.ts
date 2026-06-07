#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'

const source = fs.readFileSync(path.join(root, 'src/core/zellij/zellij-right-column-manager.ts'), 'utf8')
const worker = fs.readFileSync(path.join(root, 'src/core/zellij/zellij-worker-pane-manager.ts'), 'utf8')
const schemaExists = fs.existsSync(path.join(root, 'schemas/zellij/zellij-right-column-state.schema.json'))
const report = {
  schema: 'sks.zellij-right-column-manager-check.v1',
  ok: true,
  exports: ['ensureRightColumn', 'prepareWorkerInRightColumn', 'recordWorkerPaneInRightColumn', 'recordHeadlessWorkerInRightColumn', 'closeWorkerInRightColumn'].every((name) => source.includes(`function ${name}`)),
  dashboard_after_worker_reservation: source.includes('right_column_creating') && source.includes('scheduler_slot_reserved'),
  dashboard_opt_in: source.includes('zellijUiModeCreatesDashboard') && source.includes('dashboard_created: false'),
  slot_column_anchor_right: worker.includes('buildZellijSlotColumnAnchorCommand') && worker.includes("'--direction', 'right', '--name', 'SLOTS'"),
  worker_direction_stack: worker.includes("'--direction', directionRequested")
    && worker.includes("const directionRequested: 'right' | 'down' = 'down'")
    && worker.includes("'--near-current-pane'")
    && worker.includes('worker_direction_requested')
    && worker.includes('slot_column_anchor_pane_id'),
  headless_overflow: source.includes('worker_headless_overflow') && source.includes('visible_pane_cap'),
  schema_exists: schemaExists
}
report.ok = report.exports && report.dashboard_after_worker_reservation && report.dashboard_opt_in && report.slot_column_anchor_right && report.worker_direction_stack && report.headless_overflow && report.schema_exists
assertGate(report.ok, 'right-column manager must own opt-in dashboard, stacked workers, headless overflow, and state schema', report)
emitGate('zellij:right-column-manager', report)
