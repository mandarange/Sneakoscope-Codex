import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCodexHookOutput } from '../../dist/core/codex-compat/codex-hook-output-normalizer.js';

test('normalizer emits camelCase PreToolUse decisions', () => {
  const deny = normalizeCodexHookOutput('pre-tool', { decision: 'block', reason: 'blocked' });
  assert.equal(deny.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(deny.hookSpecificOutput.permissionDecision, 'deny');
  assert.ok(!Object.hasOwn(deny, 'permissionDecision'));

  const allow = normalizeCodexHookOutput('pre-tool', { permissionDecision: 'allow' });
  assert.deepEqual(allow, { continue: true });
  const context = normalizeCodexHookOutput('pre-tool', { additionalContext: 'current skill path' });
  assert.deepEqual(context, {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'current skill path'
    }
  });
  const rewrite = normalizeCodexHookOutput('pre-tool', { permissionDecision: 'allow', updatedInput: { command: 'npm test' } });
  assert.equal(rewrite.hookSpecificOutput.permissionDecision, 'allow');
  assert.deepEqual(rewrite.hookSpecificOutput.updatedInput, { command: 'npm test' });
});

test('normalizer keeps PermissionRequest reserved fields out', () => {
  const output = normalizeCodexHookOutput('permission-request', { decision: 'deny', reason: 'no' });
  assert.deepEqual(Object.keys(output.hookSpecificOutput.decision).sort(), ['behavior', 'message']);
});
