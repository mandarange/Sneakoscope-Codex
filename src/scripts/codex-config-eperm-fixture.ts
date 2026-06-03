#!/usr/bin/env node
// @ts-nocheck
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-eperm-fixture-'));
await fs.mkdir(path.join(fixture, '.codex'), { recursive: true });
await fs.writeFile(path.join(fixture, '.codex', 'config.toml'), 'sandbox_mode = "workspace-write"\n');

const result = spawnSync(process.execPath, [
  path.join(root, 'dist', 'scripts', 'codex-config-load-probe.js'),
  '--root',
  fixture,
  '--config',
  path.join(fixture, '.codex', 'config.toml'),
  '--codex-bin',
  path.join(root, 'dist', 'scripts', 'fixtures', 'fake-codex-config-loader.js'),
  '--json'
], {
  cwd: root,
  env: { ...process.env, SKS_FAKE_CODEX_CONFIG_EPERM: '1' },
  encoding: 'utf8'
});

const report = JSON.parse(result.stdout || '{}');
const ok = result.status !== 0
  && report.checks?.find((row) => row.name === 'node_read')?.ok === true
  && report.blockers?.includes('codex_cli_config_eperm');

console.log(JSON.stringify({ schema: 'sks.codex-config-eperm-fixture.v1', ok, report }, null, 2));
if (!ok) process.exitCode = 1;
