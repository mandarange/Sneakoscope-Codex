import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';

test('scouts validate --strict never creates a scout mission', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scout-strict-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"fixture"}\n');
  const result = await runProcess(process.execPath, [path.join(process.cwd(), 'bin/sks.mjs'), 'scouts', 'validate', 'latest', '--strict', '--json'], {
    cwd: root,
    timeoutMs: 15000,
    maxOutputBytes: 64 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  assert.notEqual(result.code, 0);
  await assert.rejects(fs.access(path.join(root, '.sneakoscope', 'missions')));
});
