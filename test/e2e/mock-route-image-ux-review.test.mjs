import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';

test('mock e2e Image UX Review route finalizes image proof relation', async () => {
  const result = await runProcess(process.execPath, [path.join(process.cwd(), 'bin/sks.mjs'), 'proof', 'finalize', 'latest', '--route', '$Image-UX-Review', '--mock', '--require-relation', '--json'], {
    cwd: process.cwd(),
    timeoutMs: 15000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.proof.route, '$Image-UX-Review');
  assert.ok(json.proof.evidence.image_voxels.relations >= 1);
});
