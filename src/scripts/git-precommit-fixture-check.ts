// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { runProcess } from '../core/fsx.js';

const bin = path.join(process.cwd(), 'dist', 'bin', 'sks.js');

const runtimeRoot = await fixtureRoot('runtime');
await runProcess('git', ['init'], { cwd: runtimeRoot });
await runSks(runtimeRoot, ['git', 'install', '--json']);
await fs.mkdir(path.join(runtimeRoot, '.sneakoscope', 'missions'), { recursive: true });
await fs.writeFile(path.join(runtimeRoot, '.sneakoscope', 'missions', 'runtime.json'), '{}\n');
await runProcess('git', ['add', '-f', '.sneakoscope/missions/runtime.json'], { cwd: runtimeRoot });
const blocked = await runProcess(process.execPath, [bin, 'git', 'precommit', '--json'], { cwd: runtimeRoot });
assert.equal(blocked.code, 1, blocked.stdout || blocked.stderr);
assert.match(blocked.stdout, /runtime_noise_not_staged/);

const sharedRoot = await fixtureRoot('shared');
await runProcess('git', ['init'], { cwd: sharedRoot });
await runSks(sharedRoot, ['git', 'install', '--json']);
await fs.mkdir(path.join(sharedRoot, '.sneakoscope', 'wiki', 'records', 'claims'), { recursive: true });
await fs.writeFile(path.join(sharedRoot, '.sneakoscope', 'wiki', 'records', 'claims', 'ok.json'), JSON.stringify({
  schema: 'sks.triwiki-claim-record.v1',
  id: 'ok',
  status: 'supported',
  claim: { text: 'Valid shared claim.' }
}, null, 2));
await runProcess('git', ['add', '.sneakoscope/wiki/records/claims/ok.json'], { cwd: sharedRoot });
const allowed = await runProcess(process.execPath, [bin, 'git', 'precommit', '--json'], { cwd: sharedRoot });
assert.equal(allowed.code, 0, allowed.stdout || allowed.stderr);
console.log(JSON.stringify({ ok: true, schema: 'sks.git-precommit-fixture.v1' }, null, 2));

async function fixtureRoot(name) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `sks-precommit-fixture-${name}-`));
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"fixture","private":true}\n');
  return root;
}

async function runSks(root, args) {
  const result = await runProcess(process.execPath, [bin, ...args], { cwd: root, env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' } });
  assert.equal(result.code, 0, result.stdout || result.stderr);
  return JSON.parse(result.stdout);
}

