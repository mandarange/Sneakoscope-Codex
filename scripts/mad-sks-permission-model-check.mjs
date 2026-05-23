#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'mad-sks', 'permission-model.js')).href);
const permission = mod.buildMadSksPermissionModel({
  targetRoot: path.join(root, 'fixture-target'),
  flags: mod.parseMadSksFlags(['--mad-sks', '--allow-system', '--allow-db-write', '--allow-package-install', '--allow-service-control', '--allow-network', '--allow-computer-use'])
});
const ok = permission.schema === 'sks.mad-sks-permission-model.v1'
  && permission.mode === 'full_system_authority'
  && permission.forbidden_scopes.includes('sks_harness_code')
  && permission.allowed_scopes.includes('computer_use');
emit({ schema: 'sks.mad-sks-permission-model-check.v1', ok, permission });

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.mad-sks-permission-model-check.v1', ok: false, blocker, detail }); process.exit(1); }
