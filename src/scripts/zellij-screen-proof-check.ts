#!/usr/bin/env node
// @ts-nocheck
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.js';
const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-screen-proof.js')).href);
const args = process.argv.slice(2);
const missionId = readArg(args, '--mission');
const mainOnly = args.includes('--main-only') || process.env.SKS_ZELLIJ_MAIN_ONLY === '1';
if (missionId && !mainOnly) await waitForHeartbeat([
  path.join(root, '.sneakoscope', 'missions', missionId, 'zellij-lane-renderer-heartbeat.jsonl'),
  path.join(root, '.sneakoscope', 'missions', missionId, 'agents', 'zellij-lane-renderer-heartbeat.jsonl')
]);
const report = await mod.writeZellijScreenProof(root, {
  require: process.env.SKS_REQUIRE_ZELLIJ === '1' || args.includes('--require-real'),
  missionId: missionId || undefined,
  ledgerRoot: missionId ? path.join(root, '.sneakoscope', 'missions', missionId) : undefined,
  mainOnly
});
const requiredTextOk = ['SKS Lane', 'Mission', 'Mode', 'Workers', 'Current', 'Queue', 'Safety', 'Blockers', 'Reports', 'Keys:'].every((label) => report.required_text?.includes(label));
emit({ ...report, required_text_fixture_ok: requiredTextOk, ok: report.ok && requiredTextOk });
function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.zellij-screen-proof-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
function readArg(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || null : null;
}
async function waitForHeartbeat(files) {
  const fs = await import('node:fs/promises');
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    for (const file of files) {
      const text = await fs.readFile(file, 'utf8').catch(() => '');
      if (text.trim()) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
