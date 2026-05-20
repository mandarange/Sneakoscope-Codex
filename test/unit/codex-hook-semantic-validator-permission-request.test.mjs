import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCodexHookSemanticOutput } from '../../dist/core/codex-compat/codex-hook-semantic-validator.js';

test('PermissionRequest semantic validator accepts canonical allow and deny', () => {
  assert.equal(validateCodexHookSemanticOutput('PermissionRequest', {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'allow' }
    }
  }).ok, true);
  assert.equal(validateCodexHookSemanticOutput('PermissionRequest', {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'deny', message: 'blocked' }
    }
  }).ok, true);
});

test('PermissionRequest semantic validator rejects reserved and unsupported fields', () => {
  for (const output of [
    { continue: true, hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: '' } } },
    { continue: true, hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow', updatedInput: {} } } },
    { continue: true, hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow', updatedPermissions: {} } } },
    { continue: true, hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow', interrupt: true } } },
    { continue: false },
    { continue: true, stopReason: 'stop' },
    { continue: true, suppressOutput: true }
  ]) {
    const result = validateCodexHookSemanticOutput('PermissionRequest', output);
    assert.equal(result.ok, false);
    assert.ok(result.fatal.length > 0);
  }
});
