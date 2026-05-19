import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { runProcess } from '../dist/core/fsx.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-shared-memory-fixture-'));
const bin = path.join(process.cwd(), 'dist', 'bin', 'sks.js');
await fs.writeFile(path.join(root, 'package.json'), '{"name":"fixture","private":true}\n');
await runProcess('git', ['init'], { cwd: root });
await runSks(['git', 'install', '--json']);
await fs.mkdir(path.join(root, '.sneakoscope', 'wiki'), { recursive: true });
await fs.writeFile(path.join(root, '.sneakoscope', 'wiki', 'context-pack.json'), JSON.stringify({
  schema: 'fixture',
  claims: [{ id: 'shared-memory-check-claim', text: 'Shared memory check claim.', status: 'supported', source: 'docs/shared-triwiki.md' }]
}, null, 2));
const publish = await runSks(['wiki', 'publish', 'latest', '--shared', '--json']);
assert.equal(publish.ok, true);
const validation = await runSks(['wiki', 'validate-shared', '--json']);
assert.equal(validation.ok, true);
console.log(JSON.stringify({ ok: true, schema: 'sks.shared-memory-fixture.v1', files: validation.files.length }, null, 2));

async function runSks(args) {
  const result = await runProcess(process.execPath, [bin, ...args], { cwd: root, env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' } });
  assert.equal(result.code, 0, result.stdout || result.stderr);
  return JSON.parse(result.stdout);
}
