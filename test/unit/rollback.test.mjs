import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';

test('rollback apply requires explicit confirmation phrase', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-rollback-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"private":true}\n');
  const result = await runProcess(process.execPath, [path.join(process.cwd(), 'bin', 'sks.mjs'), 'rollback', 'apply', 'rollback-sneakoscope', '--json'], {
    cwd: root,
    timeoutMs: 10_000,
    maxOutputBytes: 64 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' }
  });
  assert.equal(result.code, 1);
  const json = JSON.parse(result.stdout);
  assert.equal(json.status, 'blocked');
  assert.equal(json.required_confirmation, 'apply-managed-rollback');
});
