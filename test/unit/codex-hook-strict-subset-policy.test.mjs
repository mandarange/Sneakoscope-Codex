import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCodexHookOutputWarnings } from '../../dist/core/codex-compat/codex-hook-warning-detector.js';

test('PreToolUse additionalContext is accepted only in the official event-specific shape', async () => {
  const valid = await detectCodexHookOutputWarnings('PreToolUse', {
    continue: true,
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'context' }
  });
  assert.equal(valid.ok, true);

  const wrongType = await detectCodexHookOutputWarnings('PreToolUse', {
    continue: true,
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: ['context'] }
  });
  assert.equal(wrongType.ok, false);
  assert.ok(wrongType.issues_by_category.schema_violation > 0);

  const legacyTopLevel = await detectCodexHookOutputWarnings('PreToolUse', {
    continue: true,
    additionalContext: 'context'
  });
  assert.equal(legacyTopLevel.ok, false);
  assert.ok(legacyTopLevel.issues_by_category.legacy_shape > 0);
});

test('official compact systemMessage is not misclassified as an unknown top-level field', async () => {
  const result = await detectCodexHookOutputWarnings('PreCompact', {
    continue: true,
    systemMessage: 'Refresh verified managed-skill context after compact resume.'
  });
  assert.equal(result.ok, true);
  assert.equal(result.issues_by_category.schema_violation, 0);
  assert.equal(result.issues_by_category.policy_disallowed, 0);
});
