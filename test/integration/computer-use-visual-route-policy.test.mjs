import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('Computer Use policy check returns structured status without forbidden wording', async () => {
  const result = await runProcess(process.execPath, ['./scripts/computer-use-policy-check.mjs'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 25_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
});
