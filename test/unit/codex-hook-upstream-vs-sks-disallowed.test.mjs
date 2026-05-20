import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCodexHookOutputWarnings } from '../../dist/core/codex-compat/codex-hook-warning-detector.js';

test('upstream unsupported and SKS strict-subset fields land in separate buckets', async () => {
  const ask = await detectCodexHookOutputWarnings('PreToolUse', {
    continue: true,
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' }
  });
  const allowMessage = await detectCodexHookOutputWarnings('PermissionRequest', {
    continue: true,
    hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow', message: 'ok' } }
  });
  assert.equal(ask.issues_by_category.upstream_semantic_unsupported, 1);
  assert.equal(allowMessage.issues_by_category.sks_zero_warning_disallowed, 1);
});
