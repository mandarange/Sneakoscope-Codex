#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';
const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-layout-builder.js')).href);
const built = mod.buildZellijLayoutKdl({ missionId: 'M-layout-check', ledgerRoot: path.join(root, '.sneakoscope', 'tmp', 'layout-check'), cwd: root, kind: 'agent', slotCount: 2 });
const ok = built.layout_kdl.includes('layout {') && built.layout_kdl.includes('zellij-lane') && !built.layout_kdl.includes('tmux');
emit({ schema: 'sks.zellij-layout-valid-check.v1', ok, layout: built });
function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.zellij-layout-valid-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
