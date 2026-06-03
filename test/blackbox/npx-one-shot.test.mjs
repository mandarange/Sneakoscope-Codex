import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('npx one-shot black-box script supports dry-run proof shape', async () => {
  const result = await runProcess(process.execPath, ['dist/scripts/blackbox-npx-one-shot.js', '--dry-run', '--json'], {
    cwd: process.cwd(),
    timeoutMs: 30_000,
    maxOutputBytes: 64 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.schema, 'sks.blackbox-npx-one-shot.v1');
  assert.equal(parsed.ok, true);
  assert.ok(parsed.steps.some((step) => step.label === 'npm_exec_one_shot_selftest'));
});
