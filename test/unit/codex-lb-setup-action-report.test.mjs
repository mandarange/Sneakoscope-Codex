import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { configureCodexLb } from '../../dist/cli/install-helpers.js';
import { CODEX_LB_TOOL_OUTPUT_RECOVERY_MIN_VERSION } from '../../dist/core/codex-lb/codex-lb-tool-output-recovery.js';

const compatibleRecoveryFetch = async () => new Response('{}', {
  status: 200,
  headers: { 'x-app-version': CODEX_LB_TOOL_OUTPUT_RECOVERY_MIN_VERSION }
});

test('codex-lb applied actions include only performed persistence actions', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-lb-actions-'));
  const result = await configureCodexLb({
    home,
    host: 'lb.example.test',
    apiKey: 'sk-clb-actions',
    writeEnvFile: true,
    storeKeychain: false,
    syncLaunchctl: false,
    shellProfile: 'skip',
    syncCodexLogin: false,
    processEnv: {},
    toolOutputRecoveryFetch: compatibleRecoveryFetch
  });
  const actions = result.applied_actions?.map((action) => action.type) || [];
  assert.ok(actions.includes('write_env_file'));
  assert.equal(actions.includes('store_keychain'), false);
  assert.equal(actions.includes('sync_launchctl'), false);
  assert.equal(actions.includes('install_shell_profile_snippet'), false);
  assert.ok(result.persistence?.applied_modes.includes('durable_env_file'));
});
