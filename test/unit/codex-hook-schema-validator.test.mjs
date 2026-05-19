import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCodexHookOutput } from '../../dist/core/codex-compat/codex-hook-schema.js';
import { detectCodexHookOutputWarnings } from '../../dist/core/codex-compat/codex-hook-warning-detector.js';

test('vendored Codex schemas validate canonical hook output', async () => {
  const output = {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'blocked'
    }
  };
  const validation = await validateCodexHookOutput('PreToolUse', output);
  assert.equal(validation.ok, true);
});

test('warning detector blocks legacy snake_case and reserved PermissionRequest fields', async () => {
  const legacy = await detectCodexHookOutputWarnings('PreToolUse', { continue: true, permission_decision: 'deny' });
  assert.equal(legacy.ok, false);
  assert.ok(legacy.warnings.some((warning) => warning.includes('snake_case')));

  const reserved = await detectCodexHookOutputWarnings('PermissionRequest', {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'allow', updatedInput: {} }
    }
  });
  assert.equal(reserved.ok, false);
  assert.ok(reserved.warnings.includes('permission_request_reserved:updatedInput'));
});
