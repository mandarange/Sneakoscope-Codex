import test from 'node:test';
import assert from 'node:assert/strict';
import { codexGitActionReadiness } from '../../dist/core/codex-app.js';

test('Codex App git actions accept command-based remote-control readiness after feature flag removal', () => {
  const readiness = codexGitActionReadiness({
    requiredFeatureFlags: {
      codex_git_commit: true,
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
  assert.deepEqual(readiness.required_flags, ['codex_git_commit', 'hooks']);
  assert.deepEqual(readiness.required_capabilities, ['codex_cli_remote_control']);
});

test('Codex App git actions still block when the remote-control command is unavailable', () => {
  const readiness = codexGitActionReadiness({
    requiredFeatureFlags: {
      codex_git_commit: true,
      hooks: true
    },
    remoteControl: {
      ok: false,
      reason: 'requires_codex_cli_0.130.0_or_newer'
    }
  });

  assert.equal(readiness.ok, false);
  assert.deepEqual(readiness.blockers, ['requires_codex_cli_0.130.0_or_newer']);
});
