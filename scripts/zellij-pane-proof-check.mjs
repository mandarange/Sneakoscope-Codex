#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';
const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-pane-proof.js')).href);
const report = await mod.writeZellijPaneProof(root, { require: process.env.SKS_REQUIRE_ZELLIJ === '1' || process.argv.includes('--require-real') });
emit(report);
function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.zellij-pane-proof-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
