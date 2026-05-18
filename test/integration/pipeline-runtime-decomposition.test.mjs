import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../src/core/fsx.mjs';

test('pipeline runtime decomposition gates pass', async () => {
  const budget = await runProcess('npm', ['run', 'pipeline-budget:check'], {
    cwd: process.cwd(),
    timeoutMs: 30_000,
    maxOutputBytes: 64 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  assert.equal(budget.code, 0, budget.stderr || budget.stdout);

  const runtime = await runProcess('npm', ['run', 'pipeline-runtime:check'], {
    cwd: process.cwd(),
    timeoutMs: 30_000,
    maxOutputBytes: 64 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  assert.equal(runtime.code, 0, runtime.stderr || runtime.stdout);
});
