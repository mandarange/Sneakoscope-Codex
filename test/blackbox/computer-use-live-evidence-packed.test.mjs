import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('black-box Computer Use live evidence check passes', async () => {
  const result = await runProcess(process.execPath, ['./dist/scripts/computer-use-live-evidence-check.js'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 30_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(json.schema, 'sks.computer-use-live-evidence-check.v1');
  assert.equal(json.ok, true);
});
