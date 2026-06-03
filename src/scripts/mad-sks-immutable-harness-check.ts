#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.js';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'mad-sks', 'immutable-harness-guard.js')).href);
const core = mod.resolveProtectedCore({ packageRoot: root, targetRoot: root });
const engineAllowed = await mod.evaluateMadSksWrite({ packageRoot: root, targetRoot: root, operation: 'file_write', path: path.join(root, 'src', 'core', 'version.ts') });
const installedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-installed-core-'));
await fs.mkdir(path.join(installedRoot, 'src', 'core'), { recursive: true });
await fs.mkdir(path.join(installedRoot, 'scripts'), { recursive: true });
await fs.writeFile(path.join(installedRoot, 'package.json'), '{"name":"sneakoscope","version":"1.18.13"}\n');
await fs.writeFile(path.join(installedRoot, 'src', 'core', 'version.ts'), 'export const PACKAGE_VERSION = "1.18.13";\n');
const installedCore = mod.resolveProtectedCore({ packageRoot: installedRoot, targetRoot: installedRoot });
const blocked = await mod.evaluateMadSksWrite({ packageRoot: installedRoot, targetRoot: installedRoot, operation: 'file_write', path: path.join(installedRoot, 'src', 'core', 'version.ts') });
const allowed = await mod.evaluateMadSksWrite({ packageRoot: root, targetRoot: root, operation: 'file_write', path: path.join(root, '.sneakoscope', 'tmp', 'target.txt') });
const before = await mod.snapshotProtectedCore(root, 'before');
const after = await mod.snapshotProtectedCore(root, 'after');
const comparison = mod.compareProtectedCoreSnapshots(before, after);
const ok = core.schema === 'sks.mad-sks-protected-core.v1'
  && core.engine_source_exception === true
  && engineAllowed.decision === 'allowed'
  && installedCore.engine_source_exception === false
  && blocked.decision === 'blocked'
  && allowed.decision === 'allowed'
  && comparison.ok === true;
emit({ schema: 'sks.mad-sks-immutable-harness-check.v1', ok, core_count: core.protected_paths.length, core, engineAllowed, installedCore, blocked, allowed, comparison });

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.mad-sks-immutable-harness-check.v1', ok: false, blocker, detail }); process.exit(1); }
