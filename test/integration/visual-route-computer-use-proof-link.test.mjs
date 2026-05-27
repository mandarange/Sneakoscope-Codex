import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('visual route Computer Use fixture includes proof-linkable status', async () => {
  const result = await runProcess(process.execPath, ['./scripts/computer-use-visual-route-fixture-check.mjs'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 30_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(json.ok, true);
  assert.ok(json.results.every((row) => (
    row.status === 'web_verification_uses_chrome_extension'
      ? row.evidence_status === 'not_required_for_web_verification' && row.code === 1
      : row.evidence_status === row.status
  )));
});
