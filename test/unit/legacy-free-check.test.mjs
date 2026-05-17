import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';

test('legacy-free check passes the split command registry', async () => {
  const result = await runProcess(process.execPath, [path.join(process.cwd(), 'scripts/check-legacy-free.mjs')], {
    cwd: process.cwd(),
    timeoutMs: 10000,
    maxOutputBytes: 64 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Legacy-free check passed/);
});
