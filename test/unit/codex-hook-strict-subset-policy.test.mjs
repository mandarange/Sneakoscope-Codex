import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCodexHookOutputWarnings } from '../../dist/core/codex-compat/codex-hook-warning-detector.js';

test('PreToolUse additionalContext is SKS strict-subset disallowed, not upstream unsupported', async () => {
  const result = await detectCodexHookOutputWarnings('PreToolUse', {
    continue: true,
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'context' }
  });
  assert.equal(result.ok, false);
  assert.equal(result.issues_by_category.sks_zero_warning_disallowed, 1);
  assert.equal(result.issues_by_category.upstream_semantic_unsupported, 0);
});
