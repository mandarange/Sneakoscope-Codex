#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';
const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-pane-proof.js')).href);
const args = process.argv.slice(2);
const missionId = readArg(args, '--mission');
const sessionName = readArg(args, '--session');
const expectedLaneCount = Number(readArg(args, '--expected-lanes') || 0) || undefined;
const report = await mod.writeZellijPaneProof(root, {
  require: process.env.SKS_REQUIRE_ZELLIJ === '1' || args.includes('--require-real'),
  missionId: missionId || undefined,
  sessionName: sessionName || undefined,
  expectedLaneCount,
  ledgerRoot: missionId ? path.join(root, '.sneakoscope', 'missions', missionId) : undefined
});
const positive = mod.evaluateZellijPaneProofRows(mod.normalizeZellijPaneRows([
  { pane_id: '1', name: 'orchestrator', command: 'sh -lc sks status --json', cwd: root, exited: false, x: 0, y: 0, width: 80, height: 24 },
  { pane_id: '2', name: 'slot-001', command: 'sh -lc sks zellij-lane --mission M --slot slot-001', cwd: root, exited: false, x: 80, y: 0, width: 40, height: 24 }
]), { expectedLaneCount: 1, expectedCwd: root });
const missingLane = mod.evaluateZellijPaneProofRows(mod.normalizeZellijPaneRows([
  { pane_id: '1', name: 'orchestrator', command: 'sh', cwd: root, exited: false }
]), { expectedLaneCount: 1, expectedCwd: root });
const exitedLane = mod.evaluateZellijPaneProofRows(mod.normalizeZellijPaneRows([
  { pane_id: '1', name: 'orchestrator', command: 'sh', cwd: root, exited: false },
  { pane_id: '2', name: 'slot-001', command: 'sks zellij-lane --mission M --slot slot-001', cwd: root, exited: true }
]), { expectedLaneCount: 1, expectedCwd: root });
const madCodexMain = mod.evaluateZellijPaneProofRows(mod.normalizeZellijPaneRows([
  { pane_id: '1', name: 'orchestrator', command: 'codex --profile sks-mad-high', cwd: root, exited: false },
  { pane_id: '2', name: 'slot-001', command: 'sks zellij-lane --mission M --slot slot-001', cwd: root, exited: false }
]), { expectedLaneCount: 1, expectedCwd: root, expectedMainCommandIncludes: 'codex' });
const madShellMain = mod.evaluateZellijPaneProofRows(mod.normalizeZellijPaneRows([
  { pane_id: '1', name: 'orchestrator', command: 'sh -lc sks status --json', cwd: root, exited: false },
  { pane_id: '2', name: 'slot-001', command: 'sks zellij-lane --mission M --slot slot-001', cwd: root, exited: false }
]), { expectedLaneCount: 1, expectedCwd: root, expectedMainCommandIncludes: 'codex' });
const codexLbOnlyMain = mod.evaluateZellijPaneProofRows(mod.normalizeZellijPaneRows([
  { pane_id: '1', name: 'orchestrator', command: 'sh -lc model_provider="codex-lb"', cwd: root, exited: false },
  { pane_id: '2', name: 'slot-001', command: 'sks zellij-lane --mission M --slot slot-001', cwd: root, exited: false }
]), { expectedLaneCount: 1, expectedCwd: root, expectedMainCommandIncludes: 'codex' });
const fixtureOk = positive.blockers.length === 0
  && missingLane.blockers.includes('zellij_lane_pane_missing')
  && exitedLane.blockers.some((blocker) => blocker.startsWith('zellij_lane_pane_exited'))
  && madCodexMain.blockers.length === 0
  && madShellMain.blockers.includes('zellij_main_pane_unexpected_command:codex')
  && codexLbOnlyMain.blockers.includes('zellij_main_pane_unexpected_command:codex');
emit({ ...report, fixture_ok: fixtureOk, fixture_results: { positive, missingLane, exitedLane, madCodexMain, madShellMain, codexLbOnlyMain }, ok: report.ok && fixtureOk });
function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.zellij-pane-proof-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
function readArg(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || null : null;
}
