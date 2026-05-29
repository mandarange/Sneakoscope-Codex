#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });

const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'mad-sks', 'tmux-mad-config-smoke.js')).href);
const report = await mod.runMadTmuxConfigSmoke(root, { required: process.env.SKS_REQUIRE_REAL_TMUX === '1' });
const ok = report.ok === true || report.integration_optional === true;
console.log(JSON.stringify({ schema: 'sks.mad-tmux-config-read-smoke-check.v1', ok, report }, null, 2));
if (!ok) process.exitCode = 1;

function fail(blocker, detail) {
  console.log(JSON.stringify({ schema: 'sks.mad-tmux-config-read-smoke-check.v1', ok: false, blocker, detail }, null, 2));
  process.exit(1);
}
