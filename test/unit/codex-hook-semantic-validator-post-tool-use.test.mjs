import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCodexHookSemanticOutput } from '../../dist/core/codex-compat/codex-hook-semantic-validator.js';

test('PostToolUse semantic validator accepts canonical context and block outputs', () => {
  assert.equal(validateCodexHookSemanticOutput('PostToolUse', {
    continue: true,
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'context' }
  }).ok, true);
  assert.equal(validateCodexHookSemanticOutput('PostToolUse', {
    continue: true,
    decision: 'block',
    reason: 'blocked'
  }).ok, true);
});

test('PostToolUse semantic validator rejects block without reason and unsupported output rewrite', () => {
  for (const output of [
    { continue: true, decision: 'block' },
    { continue: true, reason: 'orphan' },
    { continue: true, suppressOutput: true },
    { continue: true, hookSpecificOutput: { hookEventName: 'PostToolUse', updatedMCPToolOutput: 'changed' } }
  ]) {
    const result = validateCodexHookSemanticOutput('PostToolUse', output);
    assert.equal(result.ok, false);
    assert.ok(result.fatal.length > 0);
  }
});
