import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess, exists } from '../../dist/core/fsx.js';
import { codexLbFixtureEnv } from '../../dist/scripts/codex-lb-fixture-env.js';

test('black-box codex-lb --no-env-file creates no env file', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-bb-lb-noenv-'));
  const result = await runProcess(process.execPath, [path.resolve('dist/bin/sks.js'), 'codex-lb', 'setup', '--host', 'lb.example.test', '--api-key-stdin', '--yes', '--no-env-file', '--json'], {
    cwd: home,
    input: 'sk-clb-test\n',
    env: codexLbFixtureEnv(home),
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.equal(await exists(path.join(home, '.codex', 'sks-codex-lb.env')), false);
});
