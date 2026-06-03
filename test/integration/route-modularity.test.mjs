import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('route command wrappers no longer import route-cli', async () => {
  const result = await runProcess(process.execPath, ['dist/scripts/check-route-modularity.js'], { cwd: process.cwd(), timeoutMs: 15000 });
  assert.equal(result.code, 0, result.stderr || result.stdout);
});
