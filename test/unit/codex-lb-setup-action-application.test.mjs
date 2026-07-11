import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess, exists, readText } from '../../dist/core/fsx.js';

test('codex-lb setup applies selected actions and reports drift-free writes', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-lb-apply-'));
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'codex-lb', 'setup', '--host', 'lb.example.test', '--api-key-stdin', '--yes', '--no-keychain', '--no-launchctl', '--json'], {
    input: 'sk-clb-test\n',
    env: { ...process.env, HOME: home, CI: 'true', SKS_CODEX_LB_CHAIN_CHECK: '0', SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  const config = await readText(path.join(home, '.codex', 'config.toml'), '');
  assert.equal(result.code, 1);
  assert.equal(json.ok, false);
  assert.equal(json.status, 'configured');
  assert.equal(await exists(path.join(home, '.codex', 'sks-codex-lb.env')), true);
  assert.match(config, /^\s*model_provider\s*=\s*"codex-lb"/m);
  assert.match(config, /^\s*env_key\s*=\s*"CODEX_LB_API_KEY"/m);
  assert.match(config, /^\s*requires_openai_auth\s*=\s*true/m);
  assert.deepEqual(json.drift, []);
  assert.ok(json.codex_app_fast_ui.selected_provider_blockers.includes('codex_lb_gpt_5_6_catalog_unverified'));
});
