#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root as repoRoot } from './lib/ensure-dist-fresh.js';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });

const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-preflight-'));
await fs.mkdir(path.join(fixture, '.codex'), { recursive: true });
await fs.mkdir(path.join(fixture, '.sneakoscope', 'reports'), { recursive: true });
await fs.writeFile(path.join(fixture, '.codex', 'config.toml'), 'sandbox_mode = "workspace-write"\n');

const mod = await import(pathToFileURL(path.join(repoRoot, 'dist', 'core', 'preflight', 'parallel-preflight-engine.js')).href);
const old = process.env.SKS_FAKE_CODEX_CONFIG_EPERM;
process.env.SKS_FAKE_CODEX_CONFIG_EPERM = '1';
const report = await mod.runCodexLaunchPreflight(fixture, {
  fix: false,
  codexBin: path.join(repoRoot, 'dist', 'scripts', 'fixtures', 'fake-codex-config-loader.js'),
  tmuxSmoke: false
});
if (old === undefined) delete process.env.SKS_FAKE_CODEX_CONFIG_EPERM;
else process.env.SKS_FAKE_CODEX_CONFIG_EPERM = old;

const ok = report.ok === false && report.blockers.includes('codex_cli_config_eperm');
console.log(JSON.stringify({ schema: 'sks.mad-preflight-blocks-unreadable-config-check.v1', ok, report }, null, 2));
if (!ok) process.exitCode = 1;

function fail(blocker, detail) {
  console.log(JSON.stringify({ schema: 'sks.mad-preflight-blocks-unreadable-config-check.v1', ok: false, blocker, detail }, null, 2));
  process.exit(1);
}
