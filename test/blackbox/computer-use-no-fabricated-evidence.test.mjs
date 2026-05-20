import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('black-box Computer Use smoke never labels fabricated evidence as live', async () => {
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'computer-use', 'smoke', '--json'], {
    env: { ...process.env, CI: 'true', SKS_TEST_REAL_COMPUTER_USE: '' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  const text = `${result.stdout}\n${result.stderr}`;
  const json = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(json.evidence.screenshot_captured, false);
  assert.equal(json.mock, false);
  assert.doesNotMatch(text, /fabricated|mock.*live/i);
});
