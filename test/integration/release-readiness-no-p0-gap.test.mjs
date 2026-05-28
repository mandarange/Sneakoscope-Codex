import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('release readiness reports no remaining P0 gaps', async () => {
  const stamp = await runProcess(process.execPath, ['./scripts/release-check-stamp.mjs', 'write'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 30_000,
    maxOutputBytes: 64 * 1024
  });
  assert.equal(stamp.code, 0, `${stamp.stdout}\n${stamp.stderr}`);
  const result = await runProcess(process.execPath, ['./scripts/release-readiness-report.mjs'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 30_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.deepEqual(json.remaining_p0_gaps, []);
});
