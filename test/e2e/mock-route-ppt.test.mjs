import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';

test('mock e2e PPT route finalizes image proof', async () => {
  const result = await runProcess(process.execPath, [path.join(process.cwd(), 'bin/sks.mjs'), 'proof', 'finalize', 'latest', '--route', '$PPT', '--mock', '--json'], {
    cwd: process.cwd(),
    timeoutMs: 15000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.proof.route, '$PPT');
  assert.ok(json.proof.evidence.image_voxels.anchor_count >= 1);
});
