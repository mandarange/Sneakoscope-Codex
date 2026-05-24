import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('native agent migration release gate passes', async () => {
  const result = await runProcess('npm', ['run', process.env.SKS_GATE_NAME || 'team:native-agent-backend'], { timeoutMs: 120_000, maxOutputBytes: 512 * 1024 });
  assert.equal(result.code, 0, result.stdout + result.stderr);
});
