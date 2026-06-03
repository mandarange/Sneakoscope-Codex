#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.js';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });

const args = process.argv.slice(2);
const missionId = readArg(args, '--mission') || 'M-zellij-real-check';
const sessionName = readArg(args, '--session') || 'sks-real';
const requireReal = process.env.SKS_REQUIRE_ZELLIJ === '1' || args.includes('--require-real');
const mainOnly = args.includes('--main-only') || process.env.SKS_ZELLIJ_MAIN_ONLY === '1';
const launcher = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-launcher.js')).href);
const command = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-command.js')).href);
const screenProof = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-screen-proof.js')).href);

await command.runZellij(['kill-session', sessionName], { cwd: root, timeoutMs: 5000, optional: true });
await fs.rm(path.join(root, '.sneakoscope', 'missions', missionId), { recursive: true, force: true }).catch(() => null);

const report = await launcher.launchMadZellijUi(['--session', sessionName], {
  root,
  missionId,
  ledgerRoot: path.join(root, '.sneakoscope', 'missions', missionId, 'agents'),
  dryRun: false,
  requireZellij: requireReal,
  slotCount: 1
});

const heartbeatPath = path.join(root, '.sneakoscope', 'missions', missionId, 'zellij-lane-renderer-heartbeat.jsonl');
const heartbeat = mainOnly
  ? { ok: true, heartbeat_present: false, waited_ms: 0, timeout_ms: 0, blocker: null, skipped: true }
  : await screenProof.waitForLaneHeartbeat(heartbeatPath, { timeoutMs: 5000 });
const blockers = [
  ...(requireReal && report.ok !== true ? ['zellij_real_session_launch_failed'] : []),
  ...(requireReal && heartbeat.blocker ? [heartbeat.blocker] : [])
];
const gate = {
  schema: 'sks.zellij-real-session-launch-check.v1',
  ok: requireReal ? (report.ok === true && heartbeat.ok === true && blockers.length === 0) : report.ok === true,
  integration_optional: !requireReal,
  main_only: mainOnly,
  mission_id: missionId,
  session_name: sessionName,
  heartbeat: { path: heartbeatPath, present: heartbeat.heartbeat_present, waited_ms: heartbeat.waited_ms, timeout_ms: heartbeat.timeout_ms },
  blockers,
  report
};
await fs.mkdir(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
await fs.writeFile(path.join(root, '.sneakoscope', 'reports', 'zellij-real-session-launch.json'), `${JSON.stringify(gate, null, 2)}\n`);
emit(gate);

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.zellij-real-session-launch-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
function readArg(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || null : null;
}
