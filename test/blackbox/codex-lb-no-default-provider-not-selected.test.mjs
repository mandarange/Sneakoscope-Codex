import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess, readText } from '../../dist/core/fsx.js';
import { codexLbFixtureEnv } from '../../dist/scripts/codex-lb-fixture-env.js';

test('black-box codex-lb --no-default-provider does not select model_provider', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-bb-lb-nodefault-'));
  const result = await runProcess(process.execPath, [path.resolve('dist/bin/sks.js'), 'codex-lb', 'setup', '--host', 'lb.example.test', '--api-key-stdin', '--yes', '--no-default-provider', '--json'], {
    cwd: home,
    input: 'sk-clb-test\n',
    env: codexLbFixtureEnv(home),
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  const config = await readText(path.join(home, '.codex', 'config.toml'), '');
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.doesNotMatch(config, /^\s*model_provider\s*=\s*"codex-lb"/m);
});
