import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { mergeManagedHookTrustStateToml, mergeManagedHooksJson } from '../../dist/core/init.js';

test('managed Codex hooks write trust state hashes for current hook syntax', () => {
  const root = path.join(os.tmpdir(), 'sks-hook-trust-state');
  const hooks = JSON.parse(mergeManagedHooksJson('', 'sks'));
  assert.equal(hooks.hooks.UserPromptSubmit[0].hooks[0].statusMessage, 'SKS routing prompt and context');
  const config = mergeManagedHookTrustStateToml('model = "gpt-5.6-terra"\n', root, 'sks');
  assert.match(config, new RegExp(`\\[hooks\\.state\\."${escapeRegExp(path.join(root, '.codex', 'hooks.json'))}:user_prompt_submit:0:0"\\]`));
  assert.match(config, /trusted_hash = "sha256:[a-f0-9]{64}"/);
  assert.match(config, /pre_tool_use:0:0/);
  assert.doesNotMatch(config, /codex_hooks/);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
