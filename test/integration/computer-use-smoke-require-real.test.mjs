import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../src/core/fsx.mjs';

test('Computer Use --require-real fails when optional real capability is unavailable', async () => {
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'computer-use', 'smoke', '--require-real', '--json'], {
    env: { ...process.env, CI: 'true', SKS_TEST_REAL_COMPUTER_USE: '' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.computer-use-live-smoke.v1');
  assert.equal(json.ok, false);
  assert.equal(result.code, 1);
});
