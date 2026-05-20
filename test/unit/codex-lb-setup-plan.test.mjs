import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCodexLbSetupPlan } from '../../dist/core/codex-lb/codex-lb-setup.js';

test('codex-lb setup plan includes only selected actions', () => {
  const plan = buildCodexLbSetupPlan({
    host_or_base_url: 'lb.example.test',
    api_key_source: 'stdin',
    use_as_default_provider: false,
    write_env_file: false,
    store_keychain: false,
    sync_launchctl: false,
    install_shell_profile: 'skip',
    run_health_check: false,
    allow_insecure_localhost: false
  }, { home: '/tmp/sks-home' });
  const actions = plan.actions.map((action) => action.type);
  assert.deepEqual(actions, ['write_config_provider', 'write_metadata']);
  assert.equal(plan.base_url, 'https://lb.example.test/backend-api/codex');
});
