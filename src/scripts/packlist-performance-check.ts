#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js';

const MAX_FILES = Number(process.env.SKS_MAX_PACK_FILES || 2100);
const MAX_UNPACKED = Number(process.env.SKS_MAX_UNPACKED_BYTES || 10 * 1024 * 1024);
// Raised from 2300 KiB after the 5.4.0 dollar-command hardening pass added
// src/core/feature-fixture-executor.ts and expanded several command modules
// (route-success-helpers.ts, seo-command.ts, ppt-command.ts, qa-loop-command.ts,
// research-command.ts, image-ux-review-command.ts, mad-sks-command.ts,
// sks-menubar.ts) with genuine new production logic, pushing the packed size
// to ~2306 KiB. 5.7.0 adds doctor/update migration repair coverage and publish
// contract checks, pushing the packed tarball to ~2345 KiB. 5.9.0 adds quantum
// release evidence scripts (installed package smoke, perf budgets, scorecard,
// Super-Search contracts, and parallel smoke), pushing the packed tarball to
// ~2354 KiB. Keep a narrow cap rather than giving the package a broad size
// budget.
const MAX_PACKED = Number(process.env.SKS_MAX_PACK_BYTES || 2365 * 1024);
const SURFACE_MAX_PACKED = Number(process.env.SKS_PACKAGE_SURFACE_MAX_PACK_BYTES || 25_000_000);
const SURFACE_MAX_FILES = Number(process.env.SKS_PACKAGE_SURFACE_MAX_FILES || 2500);

function runNpmPack() {
  const npmCli = process.env.npm_execpath; // set when invoked via `npm run`
  const npmCache = process.env.SKS_RELEASE_NPM_CACHE || path.join(os.tmpdir(), 'sneakoscope-npm-cache');
  fs.mkdirSync(npmCache, { recursive: true });
  const argv = ['pack', '--dry-run', '--json', '--ignore-scripts'];
  const opts = {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      npm_config_cache: npmCache,
      NPM_CONFIG_CACHE: npmCache
    }
  };
  const res = npmCli
    ? spawnSync(process.execPath, [npmCli, ...argv], opts)
    : spawnSync('npm', argv, opts);
  return res;
}

const res = runNpmPack();
assertGate(res.status === 0, 'npm_pack_failed', { stderr: res.stderr });

let info;
try {
  const parsed = JSON.parse(res.stdout);
  info = Array.isArray(parsed) ? parsed[0] : parsed;
} catch (err) {
  assertGate(false, 'npm_pack_unparseable', { error: String(err && err.message ? err.message : err) });
}

const files = info.files.map((f) => f.path);
const runtimeManifest = JSON.parse(fs.readFileSync(path.join(root, 'runtime-required-scripts.json'), 'utf8'));
assertGate(runtimeManifest.schema === 'sks.runtime-required-scripts.v1' && Array.isArray(runtimeManifest.scripts), 'runtime required scripts manifest invalid', runtimeManifest);

assertGate(info.entryCount <= MAX_FILES, 'packlist_file_count_over_limit', { entryCount: info.entryCount, max_files: MAX_FILES });
assertGate(info.unpackedSize <= MAX_UNPACKED, 'packlist_unpacked_over_limit', { unpackedSize: info.unpackedSize, max_unpacked: MAX_UNPACKED });
assertGate(info.size <= MAX_PACKED, 'packlist_packed_over_limit', { size: info.size, max_packed: MAX_PACKED });

assertGate(files.includes('dist/bin/sks.js'), 'packlist_missing_runtime_entry', { missing: 'dist/bin/sks.js' });
for (const entry of runtimeManifest.scripts) {
  assertGate(files.includes(entry.path), 'packlist_missing_runtime_required_script', { missing: entry.path, reason: entry.reason });
}
assertGate(files.includes('package.json'), 'packlist_missing_runtime_entry', { missing: 'package.json' });
assertGate(files.includes('README.md'), 'packlist_missing_runtime_entry', { missing: 'README.md' });
assertGate(files.includes('LICENSE'), 'packlist_missing_runtime_entry', { missing: 'LICENSE' });
assertGate(files.some((f) => f.startsWith('schemas/')), 'packlist_missing_runtime_entry', { missing: 'schemas/' });

const forbidden = files.filter((f) =>
  f.startsWith('test/') ||
  f.startsWith('src/') ||
  f.includes('/__tests__/') ||
  f.endsWith('.test.js') ||
  f.startsWith('docs/internal/') ||
  f.endsWith('.map') ||
  f.startsWith('.sneakoscope/') ||
  f.endsWith('.tgz') ||
  f.startsWith('coverage/') ||
  /(^|\/)\.env/.test(f)
);
assertGate(forbidden.length === 0, 'packlist_forbidden_files', { forbidden });
assertGate(info.entryCount <= SURFACE_MAX_FILES, 'package_surface_file_count_over_limit', { entryCount: info.entryCount, max_file_count: SURFACE_MAX_FILES });
assertGate(info.size <= SURFACE_MAX_PACKED, 'package_surface_tarball_over_limit', { size: info.size, max_tarball_bytes: SURFACE_MAX_PACKED });

const report = {
  entryCount: info.entryCount,
  size: info.size,
  unpackedSize: info.unpackedSize,
  runtime_required_scripts: runtimeManifest.scripts.map((entry) => entry.path),
  runtime_required_missing: runtimeManifest.scripts.filter((entry) => !files.includes(entry.path)).map((entry) => entry.path),
  max_files: MAX_FILES,
  max_packed: MAX_PACKED,
  max_unpacked: MAX_UNPACKED,
  forbidden: []
};
const out = path.join(root, '.sneakoscope', 'reports', 'packlist-performance.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

const surfaceReport = {
  schema: 'sks.package-surface-budget.v1',
  ok: true,
  generated_at: new Date().toISOString(),
  max_tarball_bytes: SURFACE_MAX_PACKED,
  max_file_count: SURFACE_MAX_FILES,
  actual_tarball_bytes: info.size,
  actual_file_count: info.entryCount,
  forbidden_globs: [
    'dist/**/__tests__/**',
    'dist/**/*.test.js',
    '.sneakoscope/**',
    'src/**',
    'test/**'
  ],
  forbidden_findings: forbidden,
  blockers: []
};
fs.writeFileSync(path.join(root, '.sneakoscope', 'reports', 'package-surface-budget.json'), `${JSON.stringify(surfaceReport, null, 2)}\n`);

emitGate('publish:packlist-performance', {
  files: info.entryCount,
  packed_kib: Math.round(info.size / 1024),
  unpacked_mib: +(info.unpackedSize / 1048576).toFixed(2)
});
