import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../src/core/fsx.mjs';

test('pack install black-box contract includes packed sks run --execute', async () => {
  const result = await runProcess(process.execPath, ['scripts/blackbox-pack-install.mjs', '--dry-run', '--json'], {
    cwd: process.cwd(),
    timeoutMs: 30_000,
    maxOutputBytes: 64 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  const labels = parsed.steps.map((step) => step.label);
  assert.ok(labels.includes('npm_install_tarball'));
  assert.ok(labels.includes('npx_sks_run_execute_mock'));
  assert.ok(labels.includes('verify_completion_proof_exists'));
});
