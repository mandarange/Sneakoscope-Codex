import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CODEX_REASONING_EFFORT,
  forceRequiredCodexModelArgs,
  forceRequiredCodexModelConfigArgs,
  isForbiddenCodexModel,
  preserveCodexModelArgs
} from '../../dist/core/codex-model-guard.js';
import { buildCodexExecArgs } from '../../dist/core/codex-adapter.js';

test('SKS keeps reasoning guidance without owning a finite Codex model catalog', () => {
  assert.equal(DEFAULT_CODEX_REASONING_EFFORT, 'high');
  for (const model of ['future-codex-model', 'custom/provider-model', 'gpt-next', '']) {
    assert.equal(isForbiddenCodexModel(model), false, model);
  }
});

test('Codex model arguments pass through byte-for-byte instead of being injected or rewritten', () => {
  const future = ['--model', 'future-codex-model', '-c', 'model="custom/provider-model"', 'exec'];
  assert.deepEqual(preserveCodexModelArgs([]), []);
  assert.deepEqual(preserveCodexModelArgs(future), future);
  assert.deepEqual(forceRequiredCodexModelArgs(['exec']), ['exec']);
  assert.deepEqual(forceRequiredCodexModelArgs(future), future);
  assert.deepEqual(forceRequiredCodexModelConfigArgs(future), future);
});

test('environment model values are not silently injected into unrelated argument lists', () => {
  const saved = process.env.SKS_CODEX_MODEL;
  try {
    process.env.SKS_CODEX_MODEL = 'future-codex-model';
    assert.deepEqual(forceRequiredCodexModelArgs(['exec']), ['exec']);
    assert.deepEqual(forceRequiredCodexModelArgs(['--model', 'explicit-model', 'exec']), ['--model', 'explicit-model', 'exec']);
  } finally {
    if (saved === undefined) delete process.env.SKS_CODEX_MODEL;
    else process.env.SKS_CODEX_MODEL = saved;
  }
});

test('Codex exec inherits the current Codex selection unless a caller explicitly supplies a model', () => {
  const inherited = buildCodexExecArgs({ root: '/tmp/project', prompt: 'test', json: false });
  assert.equal(inherited.includes('--model'), false);
  const explicit = buildCodexExecArgs({ root: '/tmp/project', prompt: 'test', json: false, extraArgs: ['--model', 'future-codex-model'] });
  assert.deepEqual(explicit.slice(-3), ['--model', 'future-codex-model', 'test']);
});
