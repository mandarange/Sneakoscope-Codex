#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const layoutMod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-layout-builder.js')).href);
const tmpRoot = path.join(root, '.sneakoscope', 'tmp', 'spawn-on-demand-layout-check');
const built = layoutMod.buildZellijLayoutKdl({ missionId: 'M-spawn-on-demand-layout', ledgerRoot: tmpRoot, cwd: root, kind: 'naruto', slotCount: 24 });
const validation = layoutMod.validateZellijLayoutKdl(built.layout_kdl);
const writeBuilt = await layoutMod.writeZellijLayout(root, { missionId: 'M-spawn-on-demand-layout-write', ledgerRoot: tmpRoot, cwd: root, kind: 'agent', slotCount: 5 });
const manifest = JSON.parse(await fs.readFile(path.join(tmpRoot, 'zellij-lane-runtime.json'), 'utf8'));
const workerPaneMatches = built.layout_kdl.match(/pane name="slot-/g) || [];
const laneCommandMatches = built.layout_kdl.match(/\bzellij-lane\b/g) || [];
const ok = validation.ok
  && built.initial_worker_panes === 0
  && built.lane_runtime_policies.length === 0
  && workerPaneMatches.length === 0
  && laneCommandMatches.length === 0
  && manifest.lanes.length === 0
  && writeBuilt.initial_worker_panes === 0;
emit({
  schema: 'sks.zellij-spawn-on-demand-layout-check.v1',
  ok,
  initial_worker_panes: built.initial_worker_panes,
  slot_count_request: built.slot_count,
  lane_runtime_policy_count: built.lane_runtime_policies.length,
  worker_pane_matches: workerPaneMatches.length,
  lane_command_matches: laneCommandMatches.length,
  monitor_pane_enabled: built.monitor_pane_enabled,
  validation,
  manifest_lane_count: manifest.lanes.length,
  layout_path: writeBuilt.layout_path,
  blockers: ok ? [] : ['zellij_spawn_on_demand_layout_contract_failed']
});

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.zellij-spawn-on-demand-layout-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
