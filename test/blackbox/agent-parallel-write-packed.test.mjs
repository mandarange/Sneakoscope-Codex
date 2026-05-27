import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('packed agent parallel write kernel gate runs', async () => {
  const result = await runProcess('npm', ['run', 'agent:parallel-write-kernel', '--silent'], { timeoutMs: 60_000, maxOutputBytes: 256 * 1024 });
  assert.equal(result.code, 0, result.stderr || result.stdout);
});
