import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('packed command import smoke validates every registered command from dist', async () => {
  const result = await runProcess(process.execPath, ['scripts/blackbox-command-import-smoke.mjs'], {
    cwd: process.cwd(),
    timeoutMs: 120_000,
    maxOutputBytes: 128 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.schema, 'sks.blackbox-command-import-smoke.v1');
  assert.equal(parsed.ok, true);
  const lazyImports = parsed.rows.filter((row) => row.label.startsWith('lazy_import:'));
  assert.ok(lazyImports.length >= 12);
  assert.equal(lazyImports.every((row) => row.ok), true);
});
