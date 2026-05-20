import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCodexHookSemanticOutput } from '../../dist/core/codex-compat/codex-hook-semantic-validator.js';

test('UserPromptSubmit semantic validator checks block reason and context location', () => {
  assert.equal(validateCodexHookSemanticOutput('UserPromptSubmit', {
    continue: true,
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'route context' }
  }).ok, true);
  assert.equal(validateCodexHookSemanticOutput('UserPromptSubmit', {
    continue: true,
    decision: 'block',
    reason: 'need answer'
  }).ok, true);
  assert.equal(validateCodexHookSemanticOutput('UserPromptSubmit', {
    continue: true,
    decision: 'block',
    reason: ''
  }).ok, false);
  assert.equal(validateCodexHookSemanticOutput('UserPromptSubmit', {
    continue: true,
    additionalContext: 'legacy'
  }).ok, false);
});
