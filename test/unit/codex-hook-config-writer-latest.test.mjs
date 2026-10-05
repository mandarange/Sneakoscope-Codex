import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateCodexCommandHookConfig } from '../../dist/core/codex-hooks/codex-hook-config-writer.js';

test('hook config writer rejects empty commands, bad timeout, and invalid matcher placement', () => {
  assert.deepEqual(validateCodexCommandHookConfig({ event: 'Stop', command: 'sks hook stop', matcher: 'Bash' }), ['matcher_not_applicable:Stop']);
  assert.ok(validateCodexCommandHookConfig({ event: 'PreToolUse', command: '', matcher: '*' }).includes('empty_command'));
  assert.ok(validateCodexCommandHookConfig({ event: 'PreToolUse', command: 'sks hook pre-tool', matcher: '[' }).includes('invalid_matcher'));
  assert.ok(validateCodexCommandHookConfig({ event: 'PreToolUse', command: 'sks hook pre-tool', timeout: 0 }).includes('timeout_less_than_1'));
});
