#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'mad-sks', 'immutable-harness-guard.js')).href);
const core = mod.resolveProtectedCore({ packageRoot: root, targetRoot: root });
const blocked = await mod.evaluateMadSksWrite({ packageRoot: root, targetRoot: root, operation: 'file_write', path: path.join(root, 'src', 'core', 'version.ts') });
const allowed = await mod.evaluateMadSksWrite({ packageRoot: root, targetRoot: root, operation: 'file_write', path: path.join(root, '.sneakoscope', 'tmp', 'target.txt') });
const before = await mod.snapshotProtectedCore(root, 'before');
const after = await mod.snapshotProtectedCore(root, 'after');
const comparison = mod.compareProtectedCoreSnapshots(before, after);
const ok = core.schema === 'sks.mad-sks-protected-core.v1' && blocked.decision === 'blocked' && allowed.decision === 'allowed' && comparison.ok === true;
emit({ schema: 'sks.mad-sks-immutable-harness-check.v1', ok, core_count: core.protected_paths.length, blocked, allowed, comparison });

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.mad-sks-immutable-harness-check.v1', ok: false, blocker, detail }); process.exit(1); }
