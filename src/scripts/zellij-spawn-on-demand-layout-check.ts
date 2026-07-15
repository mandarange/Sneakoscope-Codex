#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { packageRoot } from '../core/fsx.js'
import { buildZellijLayoutKdl, validateZellijLayoutKdl, writeZellijLayout } from '../core/zellij/zellij-layout-builder.js'

const root = packageRoot()
const tmpRoot = path.join(root, '.sneakoscope', 'tmp', 'spawn-on-demand-layout-check')
process.env.SKS_ZELLIJ_VIEWPORTS = '3'
const built = buildZellijLayoutKdl({ missionId: 'M-spawn-on-demand-layout', ledgerRoot: tmpRoot, cwd: root, kind: 'naruto', slotCount: 24 })
const validation = validateZellijLayoutKdl(built.layout_kdl)
const writeBuilt = await writeZellijLayout(root, { missionId: 'M-spawn-on-demand-layout-write', ledgerRoot: tmpRoot, cwd: root, kind: 'naruto', slotCount: 5 })
const manifest = JSON.parse(await fs.readFile(path.join(tmpRoot, 'zellij-lane-runtime.json'), 'utf8'))
const workerPaneMatches = built.layout_kdl.match(/pane name="slot-/g) || []
const viewportPaneMatches = built.layout_kdl.match(/pane name="sks-viewport-/g) || []
const laneCommandMatches = built.layout_kdl.match(/\bzellij-lane\b/g) || []
const ok = validation.ok
  && built.initial_worker_panes === 0
  && built.viewport_count === 3
  && built.ui_architecture === 'monitor_plus_viewports'
  && built.lane_runtime_policies.length === 0
  && workerPaneMatches.length === 0
  && viewportPaneMatches.length === 3
  && laneCommandMatches.length === 0
  && manifest.lanes.length === 0
  && writeBuilt.initial_worker_panes === 0
emit({
  schema: 'sks.zellij-spawn-on-demand-layout-check.v1',
  ok,
  initial_worker_panes: built.initial_worker_panes,
  viewport_count: built.viewport_count,
  lane_runtime_policy_count: built.lane_runtime_policies.length,
  worker_pane_matches: workerPaneMatches.length,
  viewport_pane_matches: viewportPaneMatches.length,
  lane_command_matches: laneCommandMatches.length,
  monitor_pane_enabled: built.monitor_pane_enabled,
  validation,
  manifest_lane_count: manifest.lanes.length,
  layout_path: writeBuilt.layout_path,
  blockers: ok ? [] : ['zellij_dynamic_viewport_layout_contract_failed']
})

function emit(report: Record<string, unknown>) {
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}
