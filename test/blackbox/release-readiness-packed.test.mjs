import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { runProcess } from '../../dist/core/fsx.js';

test('black-box release readiness writes no P0 gaps', async () => {
  const stamp = await runProcess(process.execPath, ['./scripts/release-check-stamp.mjs', 'write'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 30_000,
    maxOutputBytes: 64 * 1024
  });
  assert.equal(stamp.code, 0, `${stamp.stdout}\n${stamp.stderr}`);
  const result = await runProcess(process.execPath, ['./scripts/release-readiness-report.mjs'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 90_000,
    maxOutputBytes: 2 * 1024 * 1024
  });
  assert.equal(result.code, 0);
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
  const json = JSON.parse(await fs.readFile(`.sneakoscope/reports/release-readiness-${pkg.version}.json`, 'utf8'));
  assert.equal(json.ok, true);
  assert.deepEqual(json.remaining_p0_gaps, []);
});
