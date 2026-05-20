import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCodexHookOutputWarnings } from '../../dist/core/codex-compat/codex-hook-warning-detector.js';

test('semantic failure fixture fails even when JSON shape is schema-tolerated', async () => {
  const result = await detectCodexHookOutputWarnings('PreToolUse', {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: 'please ask'
    }
  });
  assert.equal(result.ok, false);
  assert.ok(result.warnings.some((warning) => warning.includes('permissionDecision:ask')));
});
