import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('codex-lb setup truthfulness release check passes plan/apply modes', async () => {
  const result = await runProcess(process.execPath, ['./scripts/codex-lb-setup-truthfulness-check.mjs'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 30_000,
    maxOutputBytes: 512 * 1024
  });
  const json = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(json.ok, true);
});
