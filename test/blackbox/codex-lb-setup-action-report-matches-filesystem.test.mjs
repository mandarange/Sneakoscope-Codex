import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess, exists } from '../../dist/core/fsx.js';
import { codexLbFixtureEnv } from '../../dist/scripts/codex-lb-fixture-env.js';

test('black-box codex-lb setup action report matches filesystem writes', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-bb-lb-report-'));
  const result = await runProcess(process.execPath, [path.resolve('dist/bin/sks.js'), 'codex-lb', 'setup', '--host', 'lb.example.test', '--api-key-stdin', '--yes', '--no-keychain', '--no-launchctl', '--shell-profile', 'skip', '--json'], {
    cwd: home,
    input: 'sk-clb-test\n',
    env: codexLbFixtureEnv(home),
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  const actions = json.applied_actions?.map((action) => action.type) || [];
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.equal(actions.includes('write_env_file'), await exists(path.join(home, '.codex', 'sks-codex-lb.env')));
  assert.equal(actions.includes('store_keychain'), false);
  assert.equal(actions.includes('sync_launchctl'), false);
});
