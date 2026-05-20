import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCodexLbSetupPlan } from '../../dist/core/codex-lb/codex-lb-setup.js';

test('codex-lb process-only setup emits required warnings', () => {
  const plan = buildCodexLbSetupPlan({
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
  assert.equal(plan.persistence.warning, 'process_only_ephemeral');
  assert.ok(plan.persistence.warnings.includes('next_shell_requires_setup_or_env'));
  assert.ok(plan.persistence.warnings.includes('Codex App GUI launch may not see credentials'));
});
