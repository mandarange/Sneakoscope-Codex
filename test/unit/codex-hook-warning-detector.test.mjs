import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCodexHookOutputWarnings } from '../../dist/core/codex-compat/codex-hook-warning-detector.js';

test('warning detector reports zero warnings for canonical output', async () => {
  const result = await detectCodexHookOutputWarnings('Stop', {
    continue: true,
    decision: 'block',
    reason: 'proof missing'
  });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 0);
});

test('warning detector fails legacy, snake_case, unknown, and semantic-unsupported output', async () => {
  const legacy = await detectCodexHookOutputWarnings('PreToolUse', {
    continue: true,
    permissionDecision: 'deny',
    permissionDecisionReason: 'blocked'
  });
  assert.equal(legacy.ok, false);
  assert.ok(legacy.warnings.some((warning) => warning.includes('legacy_top_level')));

  const snake = await detectCodexHookOutputWarnings('PreToolUse', { continue: true, permission_decision: 'deny' });
  assert.equal(snake.ok, false);
  assert.ok(snake.warnings.some((warning) => warning.includes('snake_case')));

  const unknown = await detectCodexHookOutputWarnings('Stop', { continue: true, unexpected: true });
  assert.equal(unknown.ok, false);
  assert.ok(unknown.warnings.some((warning) => warning.includes('unknown_field')));

  const unsupported = await detectCodexHookOutputWarnings('PreToolUse', {
    continue: true,
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' }
  });
  assert.equal(unsupported.ok, false);
  assert.ok(unsupported.warnings.some((warning) => warning.includes('semantic_unsupported')));
});
