import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess, readText } from '../../src/core/fsx.mjs';

test('codex-lb --no-default-provider leaves top-level model_provider unselected', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-lb-nodefault-'));
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'codex-lb', 'setup', '--host', 'lb.example.test', '--api-key-stdin', '--yes', '--no-default-provider', '--json'], {
    input: 'sk-clb-test\n',
    env: { ...process.env, HOME: home, CI: 'true', SKS_CODEX_LB_CHAIN_CHECK: '0', SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  const config = await readText(path.join(home, '.codex', 'config.toml'), '');
  assert.equal(result.code, 0);
  assert.doesNotMatch(config, /^\s*model_provider\s*=\s*"codex-lb"/m);
});
