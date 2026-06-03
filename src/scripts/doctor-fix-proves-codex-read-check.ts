#!/usr/bin/env node
// @ts-nocheck
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repo = process.cwd();
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-doctor-fix-'));
const home = path.join(fixture, 'home');
await fs.mkdir(home, { recursive: true });

const run = spawnSync(process.execPath, [
  path.join(repo, 'dist', 'bin', 'sks.js'),
  'doctor',
  '--fix',
  '--json',
  '--codex-bin',
  path.join(repo, 'dist', 'scripts', 'fixtures', 'fake-codex-config-loader.js')
], {
  cwd: fixture,
  env: {
    ...process.env,
    HOME: home,
    CODEX_HOME: path.join(home, '.codex'),
    SKS_FAKE_CODEX_CONFIG_EPERM: '1',
    SKS_DISABLE_UPDATE_CHECK: '1'
  },
  encoding: 'utf8',
  timeout: 60000
});

const parsed = parseLastJson(run.stdout || '{}');
const ok = run.status !== 0
  && parsed.ready?.ready === false
  && parsed.ready?.blockers?.includes('codex_cli_config_eperm')
  && parsed.ready?.next_actions?.length > 0;

console.log(JSON.stringify({ schema: 'sks.doctor-fix-proves-codex-read-check.v1', ok, status: run.status, parsed }, null, 2));
if (!ok) process.exitCode = 1;

function parseLastJson(text) {
  const index = String(text).lastIndexOf('\n{');
  const jsonText = index >= 0 ? String(text).slice(index + 1) : String(text).slice(String(text).indexOf('{'));
  return JSON.parse(jsonText || '{}');
}
