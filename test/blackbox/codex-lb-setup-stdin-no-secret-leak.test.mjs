import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { runProcess } from '../../dist/core/fsx.js';

test('codex-lb setup with stdin writes env file without leaking secret', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-bb-codex-lb-stdin-'));
  const secret = 'sk-fixture-no-leak';
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'codex-lb', 'setup', '--host', 'lb.example.test', '--api-key-stdin', '--yes', '--json'], {
    input: `${secret}\n`,
    env: { ...process.env, HOME: home, CI: 'true', SKS_CODEX_LB_CHAIN_CHECK: '0', SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(secret));
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.api_key?.redacted, true);
});
