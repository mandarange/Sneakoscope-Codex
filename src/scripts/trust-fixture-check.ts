#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../core/fsx.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-trust-fixture-'));
await fs.writeFile(path.join(root, 'package.json'), '{"private":true,"name":"sks-trust-fixture"}\n');
await runProcess('git', ['init', '-q'], {
  cwd: root,
  timeoutMs: 10_000,
  maxOutputBytes: 64 * 1024,
  env: { CI: 'true' }
});
const sks = path.join(process.cwd(), 'dist', 'bin', 'sks.js');
const run = await runJson(root, sks, ['run', 'fixture', '--mock', '--json']);
const trust = await runJson(root, sks, ['trust', 'validate', run.mission_id, '--json']);
const ok = run.ok === true && ['verified', 'verified_partial'].includes(trust.status);
console.log(JSON.stringify({ schema: 'sks.trust-fixture-check.v1', ok, mission_id: run.mission_id, trust_status: trust.status, issues: trust.issues || [] }, null, 2));
if (!ok) process.exitCode = 1;

async function runJson(rootDir, sksBin, args) {
  const result = await runProcess(process.execPath, [sksBin, ...args], {
    cwd: rootDir,
    timeoutMs: 60_000,
    maxOutputBytes: 512 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' }
  });
  if (result.code !== 0) throw new Error(`${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}
