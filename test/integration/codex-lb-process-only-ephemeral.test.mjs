import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../../dist/core/fsx.js';

test('codex-lb process-only setup warns and writes no env file', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-lb-process-only-'));
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'codex-lb', 'setup', '--host', 'lb.example.test', '--api-key-stdin', '--yes', '--no-env-file', '--no-keychain', '--no-launchctl', '--shell-profile', 'skip', '--json'], {
    input: 'sk-clb-process-only\n',
    env: { ...process.env, HOME: home, CI: 'true', SKS_CODEX_LB_CHAIN_CHECK: '0', SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  assert.equal(result.code, 0);
  assert.equal(json.persistence.effective_mode, 'process_only_ephemeral');
  assert.equal(json.persistence.durable, false);
  assert.rejects(fs.stat(path.join(home, '.codex', 'sks-codex-lb.env')));
});
