#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'mad-sks', 'immutable-harness-guard.js')).href);
const before = await mod.snapshotProtectedCore(root, 'before');
const engineSource = await mod.evaluateMadSksWrite({ packageRoot: root, targetRoot: root, operation: 'file_write', path: path.join(root, 'dist', 'bin', 'sks.js') });
const installedRoot = path.join(root, 'node_modules', 'sneakoscope');
const blocked = await mod.evaluateMadSksWrite({ packageRoot: installedRoot, targetRoot: installedRoot, operation: 'file_write', path: path.join(installedRoot, 'dist', 'bin', 'sks.js') });
const after = await mod.snapshotProtectedCore(root, 'after');
const comparison = mod.compareProtectedCoreSnapshots(before, after);
const ok = engineSource.decision === 'allowed'
  && engineSource.protected_core?.engine_source_exception === true
  && blocked.decision === 'blocked'
  && blocked.protected_core?.engine_source_exception === false
  && comparison.ok === true;
emit({ schema: 'sks.mad-sks-no-harness-modification-check.v1', ok, engineSource, blocked, comparison });

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.mad-sks-no-harness-modification-check.v1', ok: false, blocker, detail }); process.exit(1); }
