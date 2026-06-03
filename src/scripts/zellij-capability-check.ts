#!/usr/bin/env node
// @ts-nocheck
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.js';
const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-capability.js')).href);
const report = await mod.checkZellijCapability({ root, require: process.argv.includes('--require-real') || process.env.SKS_REQUIRE_ZELLIJ === '1' });
emit(report);
function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.zellij-capability-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
