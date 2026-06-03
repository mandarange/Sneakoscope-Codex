import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('black-box codex-lb plan writes nothing', async () => {
  const result = await runProcess(process.execPath, ['./dist/scripts/codex-lb-persistence-truth-check.js'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 60_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.ok(json.results.some((row) => row.name === 'plan_writes_nothing_and_reports_process_only' && row.ok));
});
