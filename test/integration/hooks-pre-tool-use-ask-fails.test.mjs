import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCodexHookSemanticOutput } from '../../dist/core/codex-compat/codex-hook-semantic-validator.js';

test('PreToolUse permissionDecision ask fails semantic validation', () => {
  const result = validateCodexHookSemanticOutput('PreToolUse', {
    continue: true,
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' }
  });
  assert.equal(result.ok, false);
  assert.ok(result.fatal.some((issue) => issue.includes('permissionDecision:ask')));
});
