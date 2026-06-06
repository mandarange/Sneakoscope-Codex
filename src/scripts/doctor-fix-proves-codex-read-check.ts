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
  timeout: 180000
});

const parsed = parseLastJson(run.stdout || '{}');
const ok = run.status !== 0
  && parsed.ready?.ready === false
  && parsed.ready?.blockers?.includes('codex_cli_config_eperm')
  && parsed.ready?.next_actions?.length > 0;

console.log(JSON.stringify({
  schema: 'sks.doctor-fix-proves-codex-read-check.v1',
  ok,
  status: run.status,
  signal: run.signal,
  error: run.error ? String(run.error.message || run.error) : null,
  parsed,
  stdout_tail: String(run.stdout || '').slice(-1000),
  stderr_tail: String(run.stderr || '').slice(-1000)
}, null, 2));
if (!ok) process.exitCode = 1;

function parseLastJson(text) {
  const source = String(text || '').trim();
  if (!source) return {};
  const starts = [];
  for (let index = source.indexOf('{'); index >= 0; index = source.indexOf('{', index + 1)) starts.push(index);
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(source.slice(starts[i]));
    } catch {
      // Continue searching for the outer JSON object; pretty JSON may contain nested objects.
    }
  }
  return {};
}
