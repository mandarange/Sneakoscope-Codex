import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('command modules stay under the route budget', async () => {
  const result = await runProcess(process.execPath, ['dist/scripts/check-command-module-budget.js'], { cwd: process.cwd(), timeoutMs: 15000 });
  assert.equal(result.code, 0, result.stderr || result.stdout);
});
