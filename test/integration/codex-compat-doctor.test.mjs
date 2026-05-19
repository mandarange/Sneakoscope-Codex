import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';

test('Codex compatibility doctor includes schema snapshot and warning gate', async () => {
  const entry = path.join(process.cwd(), 'dist', 'bin', 'sks.js');
  const result = await runProcess(process.execPath, [entry, 'codex', 'doctor', '--json'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 25_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.compatibility.hooks_schema.ok, true);
});
