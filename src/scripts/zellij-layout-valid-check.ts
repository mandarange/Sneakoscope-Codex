#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.js';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const layoutMod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-layout-builder.js')).href);
const capabilityMod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-capability.js')).href);
const commandMod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-command.js')).href);
const built = layoutMod.buildZellijLayoutKdl({ missionId: 'M-layout-check', ledgerRoot: path.join(root, '.sneakoscope', 'tmp', 'layout-check'), cwd: root, kind: 'agent', slotCount: 2 });
const staticValidation = layoutMod.validateZellijLayoutKdl(built.layout_kdl);
const spawnOnDemandOk = built.initial_worker_panes === 0
  && built.lane_runtime_policies.length === 0
  && built.layout_kdl.includes('pane name="orchestrator"')
  && !built.layout_kdl.includes('zellij-lane')
  && !(built.layout_kdl.match(/pane name="slot-/g) || []).length
  && built.lane_dispatch_policy?.mode === 'jsonl_nonblocking'
  && built.lane_dispatch_policy?.fifo_policy === 'disabled_to_avoid_writer_blocking';
const narutoFanoutLayout = layoutMod.buildZellijLayoutKdl({
  missionId: 'M-layout-naruto-fanout',
  ledgerRoot: path.join(root, '.sneakoscope', 'tmp', 'layout-naruto-fanout'),
  cwd: root,
  kind: 'naruto',
  slotCount: 24
});
const narutoFanoutPaneCount = (narutoFanoutLayout.layout_kdl.match(/pane name="slot-/g) || []).length;
const kindsValidated = ['mad', 'agent', 'team', 'naruto'].map((kind) => {
  const b = layoutMod.buildZellijLayoutKdl({
    missionId: `M-layout-${kind}`,
    ledgerRoot: path.join(root, '.sneakoscope', 'tmp', `layout-${kind}`),
    cwd: root,
    kind,
    slotCount: 2,
    codexArgs: kind === 'mad' ? ['--profile', 'sks-mad-high', '-c', 'service_tier=fast'] : []
  });
  const hasCodexPane = kind !== 'mad' || (b.main_pane_kind === 'codex_interactive' && /exec\s+'?codex'?/.test(b.layout_kdl) && b.layout_kdl.includes('sks-mad-high') && b.layout_kdl.includes('--no-alt-screen'));
  const noLanePane = !b.layout_kdl.includes('zellij-lane') && !(b.layout_kdl.match(/pane name="slot-/g) || []).length;
  return { kind, ok: layoutMod.validateZellijLayoutKdl(b.layout_kdl).ok && hasCodexPane && noLanePane && b.initial_worker_panes === 0, main_pane_kind: b.main_pane_kind, has_codex_pane: hasCodexPane, no_lane_pane: noLanePane };
});
const allKindsOk = kindsValidated.every((k) => k.ok);
const invalidValidation = layoutMod.validateZellijLayoutKdl('layout { pane command="zellij-lane" {');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-zellij-layout-'));
const layoutPath = path.join(tmp, 'layout.kdl');
await fs.writeFile(layoutPath, built.layout_kdl, 'utf8');
const requireReal = process.env.SKS_REQUIRE_ZELLIJ === '1' || process.argv.includes('--require-real');
const capability = await capabilityMod.checkZellijCapability({ root, require: requireReal, writeReport: true });
const sessionName = 'sks-layout-check';
if (capability.status === 'ok') await commandMod.runZellij(['kill-session', sessionName], { cwd: root, timeoutMs: 2500, optional: true });
const realRun = capability.status === 'ok'
  ? {
      create_background: await commandMod.runZellij(['attach', '--create-background', sessionName, 'options', '--default-layout', layoutPath], { cwd: root, timeoutMs: 5000, optional: !requireReal }),
      cleanup: null,
      ok: false
    }
  : null;
if (realRun) {
  realRun.cleanup = await commandMod.runZellij(['kill-session', sessionName], { cwd: root, timeoutMs: 5000, optional: true });
  realRun.ok = realRun.create_background.ok === true;
}
const ok = staticValidation.ok
  && spawnOnDemandOk
  && allKindsOk
  && layoutMod.validateZellijLayoutKdl(narutoFanoutLayout.layout_kdl).ok
  && narutoFanoutPaneCount === 0
  && invalidValidation.ok === false
  && capability.ok
  && (requireReal ? realRun?.ok === true : true);
emit({
  schema: 'sks.zellij-layout-valid-check.v1',
  ok,
  layout: { ...built, layout_kdl: undefined, layout_path: layoutPath },
  spawn_on_demand_ok: spawnOnDemandOk,
  kinds_validated: kindsValidated,
  naruto_fanout_layout: { slot_count: narutoFanoutLayout.slot_count, pane_count: narutoFanoutPaneCount, initial_worker_panes: narutoFanoutLayout.initial_worker_panes },
  static_validation: staticValidation,
  invalid_fixture: invalidValidation,
  capability,
  real_run: realRun,
  integration_optional: !requireReal,
  blockers: ok ? [] : ['zellij_layout_valid_check_failed']
});
function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.zellij-layout-valid-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
