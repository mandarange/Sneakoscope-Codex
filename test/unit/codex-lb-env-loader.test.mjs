import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { runProcess } from '../../src/core/fsx.mjs';

test('fresh codex-lb HOME reports setup_needed through structured env loader output', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-lb-env-loader-'));
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'codex-lb', 'status', '--json'], {
    env: { ...process.env, HOME: home, CI: 'true' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const text = `${result.stdout}\n${result.stderr}`;
  assert.doesNotMatch(text, /Missing environment variable:\s*`?CODEX_LB_API_KEY`?/i);
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.codex-lb-status.v1');
  assert.equal(json.setup_needed, true);
});
