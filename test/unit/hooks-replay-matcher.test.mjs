import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';

test('hook replay strict matcher validates reason gate issues and secret policy', async () => {
  const result = await runProcess(process.execPath, [
    path.join(process.cwd(), 'bin/sks.mjs'),
    'hooks',
    'replay',
    'test/fixtures/hooks/stop-visual-route-without-anchor.json',
    '--json'
  ], {
    cwd: process.cwd(),
    timeoutMs: 10000,
    maxOutputBytes: 128 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.matches_expected, true);
  assert.equal(json.gate, 'completion-proof');
  assert.ok(json.issues.includes('image_voxel_anchors_missing'));
  assert.equal(json.secret_policy, 'redacted');
});
