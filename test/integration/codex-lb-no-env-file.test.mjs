import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess, exists } from '../../src/core/fsx.mjs';

test('codex-lb --no-env-file does not create the env loader file', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-lb-noenv-'));
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'codex-lb', 'setup', '--host', 'lb.example.test', '--api-key-stdin', '--yes', '--no-env-file', '--json'], {
    input: 'sk-clb-test\n',
    env: { ...process.env, HOME: home, CI: 'true', SKS_CODEX_LB_CHAIN_CHECK: '0', SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0);
  assert.equal(await exists(path.join(home, '.codex', 'sks-codex-lb.env')), false);
});
