import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('packed strategy-first gates run', async () => {
  const result = await runProcess('npm', ['run', 'strategy:adhd-orchestrating-gate', '--silent'], { timeoutMs: 60_000, maxOutputBytes: 256 * 1024 });
  assert.equal(result.code, 0, result.stderr || result.stdout);
});
