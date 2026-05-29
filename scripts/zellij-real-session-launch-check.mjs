#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });

const args = process.argv.slice(2);
const missionId = readArg(args, '--mission') || 'M-zellij-real-check';
const sessionName = readArg(args, '--session') || 'sks-real';
const requireReal = process.env.SKS_REQUIRE_ZELLIJ === '1' || args.includes('--require-real');
const launcher = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-launcher.js')).href);
const command = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-command.js')).href);

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

await waitForHeartbeat(path.join(root, '.sneakoscope', 'missions', missionId, 'zellij-lane-renderer-heartbeat.jsonl'));
const gate = {
  schema: 'sks.zellij-real-session-launch-check.v1',
  ok: report.ok === true,
  mission_id: missionId,
  session_name: sessionName,
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
async function waitForHeartbeat(file) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const text = await fs.readFile(file, 'utf8').catch(() => '');
    if (text.trim()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
