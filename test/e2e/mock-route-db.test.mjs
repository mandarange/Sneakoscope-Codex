import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';

test('mock e2e DB route finalizes completion proof', async () => {
  const result = await runProcess(process.execPath, [path.join(process.cwd(), 'bin/sks.mjs'), 'proof', 'finalize', 'latest', '--route', '$DB', '--mock', '--json'], {
    cwd: process.cwd(),
    timeoutMs: 15000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).proof.route, '$DB');
});
