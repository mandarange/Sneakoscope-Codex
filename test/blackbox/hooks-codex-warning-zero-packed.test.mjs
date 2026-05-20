import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../src/core/fsx.mjs';

test('packed hook warning-zero command reports semantic warning count zero', async () => {
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'hooks', 'warning-check', '--json'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.warnings_count, 0);
});
