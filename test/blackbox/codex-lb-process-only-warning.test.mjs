import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('black-box codex-lb persistence truth check covers process-only warning', async () => {
  const result = await runProcess(process.execPath, ['./dist/scripts/codex-lb-persistence-truth-check.js'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 60_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(json.ok, true);
  assert.ok(json.results.some((row) => row.name === 'process_only_warns_and_writes_no_env' && row.ok));
});
