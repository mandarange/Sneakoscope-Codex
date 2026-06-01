#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';
const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const layoutMod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-layout-builder.js')).href);
const capabilityMod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-capability.js')).href);
const commandMod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-command.js')).href);
const built = layoutMod.buildZellijLayoutKdl({ missionId: 'M-layout-check', ledgerRoot: path.join(root, '.sneakoscope', 'tmp', 'layout-check'), cwd: root, kind: 'agent', slotCount: 2 });
const staticValidation = layoutMod.validateZellijLayoutKdl(built.layout_kdl);
// Validate all four SKS layouts (MAD / Agent / Team / Naruto) build valid KDL.
const kindsValidated = ['mad', 'agent', 'team', 'naruto'].map((kind) => {
  const b = layoutMod.buildZellijLayoutKdl({
    missionId: `M-layout-${kind}`,
    ledgerRoot: path.join(root, '.sneakoscope', 'tmp', `layout-${kind}`),
    cwd: root,
    kind,
    slotCount: 2,
    codexArgs: kind === 'mad' ? ['--profile', 'sks-mad-high', '-c', 'service_tier=fast'] : []
  });
  const hasCodexPane = kind !== 'mad' || (b.main_pane_kind === 'codex_interactive' && /exec\s+'?codex'?/.test(b.layout_kdl) && b.layout_kdl.includes('sks-mad-high'));
  const hasLanePane = b.layout_kdl.includes('zellij-lane');
  return { kind, ok: layoutMod.validateZellijLayoutKdl(b.layout_kdl).ok && hasCodexPane && hasLanePane, main_pane_kind: b.main_pane_kind, has_codex_pane: hasCodexPane, has_lane_pane: hasLanePane };
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
      apply_layout: null,
      cleanup: null
    }
  : null;
if (realRun) {
  realRun.cleanup = await commandMod.runZellij(['kill-session', sessionName], { cwd: root, timeoutMs: 5000, optional: true });
  realRun.ok = realRun.create_background.ok === true;
}
const ok = staticValidation.ok
  && allKindsOk
  && invalidValidation.ok === false
  && capability.ok
  && (requireReal ? realRun?.ok === true : true);
emit({
  schema: 'sks.zellij-layout-valid-check.v1',
  ok,
  layout: { ...built, layout_kdl: undefined, layout_path: layoutPath },
  kinds_validated: kindsValidated,
  static_validation: staticValidation,
  invalid_fixture: invalidValidation,
  capability,
  real_run: realRun,
  integration_optional: !requireReal
});
function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.zellij-layout-valid-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
