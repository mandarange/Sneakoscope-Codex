import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCodexHookSemanticOutput } from '../../dist/core/codex-compat/codex-hook-semantic-validator.js';

test('Codex hook semantic validation exposes v2 issue categories', () => {
  const result = validateCodexHookSemanticOutput('PreToolUse', {
    continue: true,
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' }
  });
  assert.equal(result.schema, 'sks.codex-hook-semantic-validation.v2');
  assert.equal(result.issues[0].category, 'upstream_semantic_unsupported');
  assert.equal(result.issues_by_category.upstream_semantic_unsupported, 1);
});
