import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';
import { createReleaseStampProof } from '../helpers/release-stamp-proof.mjs';

test('release readiness reports no remaining P0 gaps', async () => {
  const proof = createReleaseStampProof();
  const env = { ...process.env, ...proof.env, CI: 'true' };
  try {
    const stamp = await runProcess(process.execPath, ['./dist/scripts/release-check-stamp.js', ...proof.writeArgs], {
      env,
      timeoutMs: 30_000,
      maxOutputBytes: 64 * 1024
    });
    assert.equal(stamp.code, 0, `${stamp.stdout}\n${stamp.stderr}`);
    const result = await runProcess(process.execPath, ['./dist/scripts/release-readiness-report.js'], {
      env,
      timeoutMs: 30_000,
      maxOutputBytes: 256 * 1024
    });
    const json = JSON.parse(result.stdout);
    assert.equal(result.code, 0);
    assert.deepEqual(json.remaining_p0_gaps, []);
  } finally {
    proof.cleanup();
  }
});
