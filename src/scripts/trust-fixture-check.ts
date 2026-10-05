#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../core/fsx.js';
import { createMission } from '../core/mission.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-trust-fixture-'));
const home = path.join(root, '.home');
const globalRoot = path.join(root, '.sneakoscope-global');
await fs.mkdir(path.join(home, '.codex'), { recursive: true });
await fs.writeFile(path.join(root, 'package.json'), '{"private":true,"name":"sks-trust-fixture"}\n');
await runProcess('git', ['init', '-q'], {
  cwd: root,
  timeoutMs: 10_000,
  maxOutputBytes: 64 * 1024,
  env: { CI: 'true' }
});
const sks = path.join(process.cwd(), 'dist', 'bin', 'sks.js');
process.env.HOME = home;
process.env.SKS_GLOBAL_ROOT = globalRoot;
const mission = await createMission(root, { mode: 'fixture', prompt: 'trust fixture' });
const finalize = await runJson(root, sks, ['proof', 'finalize', mission.id, '--mock', '--json'], { allowNonZero: true });
const trust = await runJson(root, sks, ['proof', 'trust', 'validate', mission.id, '--json'], { allowNonZero: true });
const issues = [...new Set([...(finalize.validation?.issues || []), ...(trust.issues || [])])];
const finalizeStatus = String(finalize.proof?.status || '');
const fakeSuccessBlocked = finalizeStatus === 'mock_only' && finalize.validation?.completion_ok === false;
const trustStatus = String(trust.status || '');
const ok = fakeSuccessBlocked
  && ['blocked', 'mock_only'].includes(trustStatus)
  && trust.ok !== true;
console.log(JSON.stringify({
  schema: 'sks.trust-fixture-check.v1',
  ok,
  mission_id: mission.id,
  finalize_status: finalizeStatus,
  trust_status: trustStatus,
  fake_success_blocked: fakeSuccessBlocked,
  issues
}, null, 2));
if (!ok) process.exitCode = 1;

async function runJson(rootDir, sksBin, args, opts = {}) {
  const result = await runProcess(process.execPath, [sksBin, ...args], {
    cwd: rootDir,
    timeoutMs: 120_000,
    maxOutputBytes: 512 * 1024,
    env: {
      HOME: home,
      CODEX_HOME: path.join(home, '.codex'),
      SKS_GLOBAL_ROOT: globalRoot,
      SKS_TEST_ISOLATION: '1',
      SKS_UPDATE_MIGRATION_GATE_DISABLED: '1',
      SKS_SKIP_NPM_FRESHNESS_CHECK: '1',
      CI: 'true'
    }
  });
  if (result.code !== 0 && opts.allowNonZero !== true) throw new Error(`${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  if (!result.stdout.trim()) {
    throw new Error(`${args.join(' ')} returned no JSON: exit=${result.code} timed_out=${result.timedOut} stderr=${result.stderr}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (err) {
    throw new Error(`${args.join(' ')} returned invalid JSON: ${err instanceof Error ? err.message : String(err)} stdout=${result.stdout.slice(-2000)} stderr=${result.stderr.slice(-2000)}`);
  }
}
