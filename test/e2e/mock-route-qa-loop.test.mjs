import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';

test('mock e2e QA-loop route finalizes visual proof', async () => {
  const result = await runProcess(process.execPath, [path.join(process.cwd(), 'bin/sks.mjs'), 'proof', 'finalize', 'latest', '--route', '$QA-LOOP', '--mock', '--require-relation', '--json'], {
    cwd: process.cwd(),
    timeoutMs: 15000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.proof.route, '$QA-LOOP');
  assert.ok(json.proof.evidence.image_voxels.anchor_count >= 1);
});
