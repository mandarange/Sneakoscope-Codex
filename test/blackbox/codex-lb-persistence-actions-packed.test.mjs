import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('black-box codex-lb action reports match persistence choices', async () => {
  const result = await runProcess(process.execPath, ['./dist/scripts/codex-lb-persistence-truth-check.js'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 60_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.ok(json.results.some((row) => row.name === 'applied_actions_match_actual_choices' && row.ok));
});
