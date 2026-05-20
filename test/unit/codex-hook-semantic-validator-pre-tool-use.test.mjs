import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCodexHookSemanticOutput } from '../../dist/core/codex-compat/codex-hook-semantic-validator.js';

test('PreToolUse semantic validator accepts canonical deny, continue, and allow rewrite', () => {
  assert.equal(validateCodexHookSemanticOutput('PreToolUse', {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'blocked'
    }
  }).ok, true);
  assert.equal(validateCodexHookSemanticOutput('PreToolUse', { continue: true }).ok, true);
  assert.equal(validateCodexHookSemanticOutput('PreToolUse', {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput: { command: 'npm test' }
    }
  }).ok, true);
});

test('PreToolUse semantic validator rejects ask, allow without rewrite, and unsupported universal fields', () => {
  for (const output of [
    { continue: true, hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' } },
    { continue: true, hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } },
    { continue: true, hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: { command: 'npm test' } } },
    { continue: false },
    { continue: true, stopReason: 'stop' },
    { continue: true, suppressOutput: true }
  ]) {
    const result = validateCodexHookSemanticOutput('PreToolUse', output);
    assert.equal(result.ok, false);
    assert.ok(result.fatal.length > 0);
  }
});
