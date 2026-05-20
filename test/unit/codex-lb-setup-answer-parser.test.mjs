import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../src/core/fsx.mjs';

test('codex-lb setup flags map no/default and no/env answers into plan fields', async () => {
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'codex-lb', 'setup', '--host', 'lb.example.test', '--api-key-stdin', '--plan', '--no-default-provider', '--no-env-file', '--json'], {
    input: 'sk-clb-test\n',
    env: { ...process.env, CI: 'true' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  const actions = json.plan.actions.map((action) => action.type);
  assert.equal(result.code, 0);
  assert.equal(actions.includes('select_default_provider'), false);
  assert.equal(actions.includes('write_env_file'), false);
});
