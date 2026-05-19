import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';

test('Codex rust-v0.131.0 hook fixture replay has zero warnings', async () => {
  const entry = path.join(process.cwd(), 'dist', 'bin', 'sks.js');
  const result = await runProcess(process.execPath, [entry, 'hooks', 'replay-codex-fixtures', '--json'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.warnings_count, 0);
});
