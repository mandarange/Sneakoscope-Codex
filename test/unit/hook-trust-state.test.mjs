import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeManagedHooksJson } from '../../dist/core/init.js';
import { sksHookHandlerRefs } from '../../dist/core/codex-hooks/sks-hook-entries.js';

test('managed Codex hooks carry the current syntax and hash the way Codex keys them', () => {
  const hooks = JSON.parse(mergeManagedHooksJson('', 'sks'));
  assert.equal(hooks.hooks.UserPromptSubmit[0].hooks[0].statusMessage, 'SKS routing prompt and context');
  const refs = sksHookHandlerRefs(hooks, '/repo/.codex/hooks.json');
  const prompt = refs.find((ref) => ref.event === 'UserPromptSubmit');
  assert.equal(prompt?.key, '/repo/.codex/hooks.json:user_prompt_submit:0:0');
  assert.match(prompt?.hash || '', /^sha256:[a-f0-9]{64}$/);
  assert.ok(refs.some((ref) => ref.key.endsWith(':pre_tool_use:0:0')));
  assert.equal(refs.every((ref) => ref.user_scope === false), true);
});

test('the user-level hooks carry the scope flag in every command', () => {
  const hooks = JSON.parse(mergeManagedHooksJson('', "'/h/.codex/sks/bin/sks-hook'", null, { commandSuffix: ' --scope=user' }));
  const refs = sksHookHandlerRefs(hooks, '/h/.codex/hooks.json');
  assert.ok(refs.length > 0);
  assert.equal(refs.every((ref) => ref.user_scope && ref.command.endsWith(' --scope=user')), true);
});
