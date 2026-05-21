import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codexCommandHookCurrentHash, codexHookStateKey } from '../../dist/core/codex-hooks/codex-hook-hash.js';

test('hook hash and state key are stable for latest event labels', () => {
  const key = codexHookStateKey('/repo/.codex/hooks.json', 'SubagentStart', 0, 0);
  const hash = codexCommandHookCurrentHash({ event: 'SubagentStart', command: 'sks hook subagent-start', timeout: 30 });
  assert.equal(key, '/repo/.codex/hooks.json:subagent_start:0:0');
  assert.match(hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(hash, codexCommandHookCurrentHash({ event: 'SubagentStart', command: 'sks hook subagent-start', timeout: 30 }));
});
