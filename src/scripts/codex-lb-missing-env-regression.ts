#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../core/fsx.js';

const rawPattern = new RegExp(['Missing environment variable:', '\\s*`?CODEX_LB_API_KEY`?'].join(''), 'i');
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-lb-missing-env-'));
const entry = path.resolve('dist/bin/sks.js');
const scenarios = [
  ['status', ['codex-lb', 'status', '--json']],
  ['doctor', ['codex-lb', 'doctor', '--deep', '--json']],
  ['health', ['codex-lb', 'health', '--json']],
  ['postinstall', ['postinstall']]
];

const results = [];
for (const [name, args] of scenarios) {
  const run = await runProcess(process.execPath, [entry, ...args], {
    env: { ...process.env, HOME: home, CI: 'true', CODEX_LB_API_KEY: '', CODEX_LB_BASE_URL: '', SKS_POSTINSTALL_NO_BOOTSTRAP: '1' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  const text = `${run.stdout}\n${run.stderr}`;
  results.push({
    name,
    code: run.code,
    raw_missing_env: rawPattern.test(text),
    has_setup_guidance: name === 'postinstall' ? true : /setup_needed|Run: sks codex-lb setup|missing_env_key|codex-lb auth/i.test(text)
  });
}

const ok = results.every((row) => row.raw_missing_env === false && row.has_setup_guidance);
console.log(JSON.stringify({
  schema: 'sks.codex-lb-missing-env-regression.v1',
  ok,
  home,
  results
}, null, 2));
if (!ok) process.exitCode = 1;
