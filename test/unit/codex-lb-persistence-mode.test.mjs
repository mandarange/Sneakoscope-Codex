import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCodexLbSetupPlan } from '../../dist/core/codex-lb/codex-lb-setup.js';

test('codex-lb setup plan classifies durable and process-only persistence', () => {
  const processOnly = buildCodexLbSetupPlan({
    host_or_base_url: 'lb.example.test',
    api_key_source: 'stdin',
    use_as_default_provider: true,
    write_env_file: false,
    store_keychain: false,
    sync_launchctl: false,
    install_shell_profile: 'skip',
    run_health_check: false,
    allow_insecure_localhost: false
  }, { home: '/tmp/sks-home' });
  assert.equal(processOnly.persistence.effective_mode, 'process_only_ephemeral');
  assert.equal(processOnly.persistence.durable, false);

  const durable = buildCodexLbSetupPlan({
    host_or_base_url: 'lb.example.test',
    api_key_source: 'stdin',
    use_as_default_provider: true,
    write_env_file: true,
    store_keychain: true,
    sync_launchctl: true,
    install_shell_profile: 'zsh',
    run_health_check: false,
    allow_insecure_localhost: false
  }, { home: '/tmp/sks-home' });
  assert.ok(durable.selected_persistence_modes.includes('durable_env_file'));
  assert.ok(durable.selected_persistence_modes.includes('durable_keychain'));
  assert.ok(durable.selected_persistence_modes.includes('durable_launchctl'));
  assert.ok(durable.selected_persistence_modes.includes('shell_profile'));
  assert.equal(durable.persistence.durable, true);
});
