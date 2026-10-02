import test from 'node:test';
import assert from 'node:assert/strict';
import { codexGitActionReadiness, codexRemoteControlStatusFromInfo } from '../../dist/core/codex-app.js';

test('remote-control status only depends on the Codex CLI being present', () => {
  const present = codexRemoteControlStatusFromInfo({ bin: '/fixture/codex', version: 'codex-cli 0.159.2' });
  assert.equal(present.ok, true);
  assert.equal(present.reason, 'available');
  assert.equal(present.command, '/fixture/codex remote-control');
  const missing = codexRemoteControlStatusFromInfo({});
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'codex_cli_missing');
});

test('Codex App git actions accept command-based remote-control readiness after feature flag removal', () => {
  // `codex features list` reports codex_git_commit and remote_control as `removed false`
  // on every supported Codex, so neither flag may gate git actions.
  const readiness = codexGitActionReadiness({
    requiredFeatureFlags: {
      codex_git_commit: false,
      hooks: true,
      remote_control: false
    },
    remoteControl: {
      ok: true,
      reason: 'available'
    }
  });

  assert.equal(readiness.ok, true);
  assert.deepEqual(readiness.blockers, []);
  assert.deepEqual(readiness.required_flags, ['hooks']);
  assert.deepEqual(readiness.required_capabilities, ['codex_cli_remote_control']);
});

test('Codex App git actions still block when the remote-control command is unavailable', () => {
  const readiness = codexGitActionReadiness({
    requiredFeatureFlags: {
      hooks: true
    },
    remoteControl: {
      ok: false,
      reason: 'codex_cli_missing'
    }
  });

  assert.equal(readiness.ok, false);
  assert.deepEqual(readiness.blockers, ['codex_cli_missing']);
});

test('Codex App git actions still block when the hooks feature is switched off', () => {
  const readiness = codexGitActionReadiness({
    requiredFeatureFlags: { hooks: false },
    remoteControl: { ok: true, reason: 'available' }
  });
  assert.equal(readiness.ok, false);
  assert.deepEqual(readiness.blockers, ['hooks']);
});
