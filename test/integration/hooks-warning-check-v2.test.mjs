import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../src/core/fsx.mjs';

test('hooks warning-check emits v2 category summary', async () => {
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'hooks', 'warning-check', '--json'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.codex-hook-warning-check.v2');
  assert.equal(typeof json.issues_by_category.schema_violation, 'number');
});
