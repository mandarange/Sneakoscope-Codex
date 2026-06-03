#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.js';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'codex', 'codex-0-136-compat.js')).href);
const evidence = await mod.collectCodex0136LocalEvidence();
const matrix = mod.codex0136Matrix({
  version: evidence.versionText,
  available: evidence.available,
  doctorText: evidence.doctorText,
  archiveHelp: evidence.archiveHelp,
  unarchiveHelp: evidence.unarchiveHelp,
  appServerHelp: evidence.appServerHelp,
  sandboxSetupHelp: evidence.sandboxSetupHelp,
  remoteControlHelp: evidence.remoteControlHelp,
  requireReal: process.argv.includes('--require-real')
});
const report = { ...matrix, local_evidence: evidence };
await fs.mkdir(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
await fs.writeFile(path.join(root, '.sneakoscope', 'reports', 'codex-0.136-compat.json'), `${JSON.stringify(report, null, 2)}\n`);
emit(report);

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.codex-0.136-compat-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
