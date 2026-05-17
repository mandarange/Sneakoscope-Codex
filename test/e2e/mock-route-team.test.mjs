import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';

test('mock e2e route proof finalization writes a completion proof', async () => {
  const result = await runProcess(process.execPath, [
    path.join(process.cwd(), 'bin/sks.mjs'),
    'proof',
    'finalize',
    'latest',
    '--route',
    '$Team',
    '--mock',
    '--json'
  ], {
    cwd: process.cwd(),
    timeoutMs: 15000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.proof.route, '$Team');
  assert.equal(json.proof.schema, 'sks.completion-proof.v1');
});
