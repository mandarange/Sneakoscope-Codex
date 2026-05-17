import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../src/core/fsx.mjs';

test('pipeline facade and split modules stay under budget', async () => {
  const result = await runProcess(process.execPath, ['scripts/check-pipeline-budget.mjs'], { cwd: process.cwd(), timeoutMs: 15000 });
  assert.equal(result.code, 0, result.stderr || result.stdout);
});
