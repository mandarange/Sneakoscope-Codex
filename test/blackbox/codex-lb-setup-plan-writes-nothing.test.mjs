import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess, exists } from '../../dist/core/fsx.js';

test('black-box codex-lb setup --plan writes nothing', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-bb-lb-plan-'));
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'codex-lb', 'setup', '--host', 'lb.example.test', '--api-key-stdin', '--plan', '--json'], {
    input: 'sk-clb-test\n',
    env: { ...process.env, HOME: home, CI: 'true' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0);
  assert.equal(await exists(path.join(home, '.codex', 'config.toml')), false);
});
