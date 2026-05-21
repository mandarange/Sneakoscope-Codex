import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CODEX_HOOK_EVENTS, CODEX_HOOK_EVENT_TO_FILE_STEM } from '../../dist/core/codex-compat/codex-schema-snapshot.js';

test('latest Codex hook event matrix includes ten events and subagents', () => {
  assert.equal(CODEX_HOOK_EVENTS.length, 10);
  assert.ok(CODEX_HOOK_EVENTS.includes('SubagentStart'));
  assert.ok(CODEX_HOOK_EVENTS.includes('SubagentStop'));
  assert.equal(CODEX_HOOK_EVENT_TO_FILE_STEM.SubagentStart, 'subagent-start');
  assert.equal(CODEX_HOOK_EVENT_TO_FILE_STEM.SubagentStop, 'subagent-stop');
});
