import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('codex-lb setup fixture command configures without leaking the key', async () => {
  const result = await runProcess(process.execPath, ['./dist/scripts/codex-lb-setup-fixture-check.js'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
});
