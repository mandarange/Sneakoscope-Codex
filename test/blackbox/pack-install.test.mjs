import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../src/core/fsx.mjs';

test('pack install black-box script supports dry-run proof shape', async () => {
  const result = await runProcess(process.execPath, ['scripts/blackbox-pack-install.mjs', '--dry-run', '--json'], {
    cwd: process.cwd(),
    timeoutMs: 30_000,
    maxOutputBytes: 64 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.schema, 'sks.blackbox-pack-install.v1');
  assert.equal(parsed.ok, true);
  assert.ok(parsed.steps.some((step) => step.label === 'npx_sks_run_execute_mock'));
  assert.ok(parsed.steps.some((step) => step.label === 'verify_completion_proof_exists'));
});
