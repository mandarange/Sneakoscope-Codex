import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { runProcess } from '../../dist/core/fsx.js';

test('codex-lb setup redacts API keys from stdout and stderr', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-lb-redaction-'));
  const secret = 'sk-fixture-redaction-secret';
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'codex-lb', 'setup', '--host', 'lb.example.test', '--api-key-stdin', '--yes', '--json'], {
    input: `${secret}\n`,
    env: { ...process.env, HOME: home, CI: 'true', SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1', SKS_CODEX_LB_CHAIN_CHECK: '0' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const text = `${result.stdout}\n${result.stderr}`;
  assert.doesNotMatch(text, new RegExp(secret));
  const json = JSON.parse(result.stdout);
  assert.equal(json.api_key?.redacted, true);
});
