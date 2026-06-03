import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('real blackbox matrix tracks paths with spaces coverage', async () => {
  const result = await runProcess(process.execPath, ['dist/scripts/blackbox-matrix.js', '--contract'], {
    cwd: process.cwd(),
    timeoutMs: 30_000,
    maxOutputBytes: 64 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  const row = parsed.rows.find((entry) => entry.id === 'path_with_spaces');
  assert.ok(row);
  assert.deepEqual(row.required_step_labels, ['npx_sks_root_json']);
});
