#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.js';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const layoutMod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-layout-builder.js')).href);
const capabilityMod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-capability.js')).href);
const commandMod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-command.js')).href);
process.env.SKS_ZELLIJ_VIEWPORTS = '4';
const built = layoutMod.buildZellijLayoutKdl({ missionId: 'M-layout-check', ledgerRoot: path.join(root, '.sneakoscope', 'tmp', 'layout-check'), cwd: root, kind: 'mad', slotCount: 2, codexArgs: ['--profile', 'sks-mad-high', '-c', 'service_tier=fast'] });
const staticValidation = layoutMod.validateZellijLayoutKdl(built.layout_kdl);
const viewportLayoutOk = built.initial_worker_panes === 0
  && built.viewport_count === 4
  && built.ui_architecture === 'monitor_plus_viewports'
  && built.lane_runtime_policies.length === 0
  && built.layout_kdl.includes('pane name="orchestrator"')
  && built.layout_kdl.includes('pane size="35%" name="sks-monitor"')
  && !built.layout_kdl.includes('zellij-lane')
  && !built.layout_kdl.includes('zellij-slot-pane')
  && (built.layout_kdl.match(/pane name="sks-viewport-/g) || []).length === 4
  && built.lane_dispatch_policy?.mode === 'jsonl_nonblocking'
  && built.lane_dispatch_policy?.fifo_policy === 'disabled_to_avoid_writer_blocking'
  && built.lane_dispatch_policy?.pane_transport === 'monitor_plus_viewports';
const narutoFanoutLayout = layoutMod.buildZellijLayoutKdl({
  missionId: 'M-layout-naruto-fanout',
  ledgerRoot: path.join(root, '.sneakoscope', 'tmp', 'layout-naruto-fanout'),
  cwd: root,
  kind: 'naruto',
  slotCount: 24
});
const narutoFanoutPaneCount = (narutoFanoutLayout.layout_kdl.match(/pane name="sks-viewport-/g) || []).length;
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
  const viewportPaneCount = (b.layout_kdl.match(/pane name="sks-viewport-/g) || []).length;
  const noLanePane = !b.layout_kdl.includes('zellij-lane');
  return { kind, ok: layoutMod.validateZellijLayoutKdl(b.layout_kdl).ok && hasCodexPane && noLanePane && viewportPaneCount === 4 && b.initial_worker_panes === 0 && b.viewport_count === 4, main_pane_kind: b.main_pane_kind, has_codex_pane: hasCodexPane, no_lane_pane: noLanePane, viewport_pane_count: viewportPaneCount };
});
const allKindsOk = kindsValidated.every((k) => k.ok);
const invalidValidation = layoutMod.validateZellijLayoutKdl('layout { pane command="zellij-lane" {');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-zellij-layout-'));
const layoutPath = path.join(tmp, 'layout.kdl');
await fs.writeFile(layoutPath, built.layout_kdl, 'utf8');
const requireReal = process.env.SKS_REQUIRE_ZELLIJ === '1' || process.argv.includes('--require-real');
const capability = await capabilityMod.checkZellijCapability({ root, require: requireReal, writeReport: true });
const runId = `${process.pid}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
const sessionName = `sks-layout-check-${runId}`;
const socketDir = path.join('/tmp', `sks-zj-layout-${runId}`);
const zellijEnv = { ZELLIJ_SOCKET_DIR: socketDir };
const realRun = capability.status === 'ok'
  ? {
      create_background: await commandMod.runZellij(['attach', '--create-background', sessionName, 'options', '--default-layout', layoutPath], { cwd: root, env: zellijEnv, timeoutMs: 5000, optional: !requireReal }),
      cleanup: null,
      session_removed: false,
      socket_dir_removed: false,
      ok: false
    }
  : null;
if (realRun) {
  realRun.cleanup = await commandMod.runZellij(['kill-session', sessionName], { cwd: root, env: zellijEnv, timeoutMs: 5000, optional: true });
  const remaining = await waitForSocketEntriesToClear(socketDir, 2000);
  realRun.session_removed = !remaining.includes(sessionName);
  if (remaining.length === 0) await fs.rm(socketDir, { recursive: true, force: true });
  realRun.socket_dir_removed = !(await exists(socketDir));
  realRun.ok = realRun.create_background.ok === true && realRun.session_removed && realRun.socket_dir_removed;
}
const ok = staticValidation.ok
  && viewportLayoutOk
  && allKindsOk
  && layoutMod.validateZellijLayoutKdl(narutoFanoutLayout.layout_kdl).ok
  && narutoFanoutPaneCount === 4
  && invalidValidation.ok === false
  && capability.ok
  && (requireReal ? realRun?.ok === true : true);
await fs.rm(tmp, { recursive: true, force: true });
emit({
  schema: 'sks.zellij-layout-valid-check.v1',
  ok,
  layout: { ...built, layout_kdl: undefined, layout_path: layoutPath },
  viewport_layout_ok: viewportLayoutOk,
  kinds_validated: kindsValidated,
  naruto_fanout_layout: { viewport_count: narutoFanoutLayout.viewport_count, pane_count: narutoFanoutPaneCount, initial_worker_panes: narutoFanoutLayout.initial_worker_panes },
  static_validation: staticValidation,
  invalid_fixture: invalidValidation,
  capability,
  real_run: realRun,
  isolated_session: true,
  socket_dir: socketDir,
  temporary_layout_removed: !(await exists(tmp)),
  integration_optional: !requireReal,
  blockers: ok ? [] : ['zellij_layout_valid_check_failed']
});
function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.zellij-layout-valid-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }

async function waitForSocketEntriesToClear(socketDir, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const entries = await fs.readdir(path.join(socketDir, 'contract_version_1')).catch(() => []);
    if (entries.length === 0 || Date.now() >= deadline) return entries;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function exists(value) {
  return fs.access(value).then(() => true).catch(() => false);
}
