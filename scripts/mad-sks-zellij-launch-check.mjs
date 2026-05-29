#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';
const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-launcher.js')).href);
const report = await mod.launchMadZellijUi(['--workspace', 'sks-mad-check'], { root, missionId: 'M-zellij-launch-check', ledgerRoot: path.join(root, '.sneakoscope', 'missions', 'M-zellij-launch-check', 'agents'), dryRun: true });
const ok = report.kind === 'mad' && report.layout_artifact && !JSON.stringify(report).includes('tmux attach');
const gate = { schema: 'sks.mad-sks-zellij-launch-check.v1', ok, report };
await fs.mkdir(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
await fs.writeFile(path.join(root, '.sneakoscope', 'reports', 'mad-sks-zellij-launch.json'), `${JSON.stringify(gate, null, 2)}\n`);
emit(gate);
function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.mad-sks-zellij-launch-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
