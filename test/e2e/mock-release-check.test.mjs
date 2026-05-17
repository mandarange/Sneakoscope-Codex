import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';

test('mock e2e release-critical fixtures pass strict artifact validation', { timeout: 180000 }, async () => {
  const result = await runProcess(process.execPath, [
    path.join(process.cwd(), 'bin/sks.mjs'),
    'all-features',
    'selftest',
    '--mock',
    '--execute-fixtures',
    '--strict-artifacts',
    '--json'
  ], {
    cwd: process.cwd(),
    timeoutMs: 180000,
    maxOutputBytes: 512 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.ok((json.fixtures.counts.pass || 0) >= 90);
  assert.equal(json.fixtures.counts.blocked || 0, 0);
  assert.ok(json.executable_fixtures.artifact_schema_validated > 0);
});
