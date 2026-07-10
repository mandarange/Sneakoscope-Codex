import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CODEX_REASONING_EFFORT,
  GPT55_CODEX_MODEL,
  GPT56_CODEX_MODELS,
  REQUIRED_CODEX_MODEL,
  SUPPORTED_CODEX_MODELS,
  forceRequiredCodexModelArgs,
  forceRequiredCodexModelConfigArgs,
  isForbiddenCodexModel
} from '../../dist/core/codex-model-guard.js';

test('codex model guard defaults to gpt-5.6-terra high and supports 5.5/5.4-mini/5.6 trio', () => {
  assert.equal(REQUIRED_CODEX_MODEL, 'gpt-5.6-terra');
  assert.equal(DEFAULT_CODEX_REASONING_EFFORT, 'high');
  assert.equal(GPT55_CODEX_MODEL, 'gpt-5.5');
  assert.deepEqual(GPT56_CODEX_MODELS, ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']);
  assert.deepEqual(SUPPORTED_CODEX_MODELS, ['gpt-5.6-terra', 'gpt-5.5', 'gpt-5.4-mini', 'gpt-5.6-sol', 'gpt-5.6-luna']);
  for (const model of SUPPORTED_CODEX_MODELS) assert.equal(isForbiddenCodexModel(model), false, model);
  assert.equal(isForbiddenCodexModel('gpt-5.6'), true);
  assert.equal(isForbiddenCodexModel('gpt-5.4'), true);
  assert.equal(isForbiddenCodexModel('gpt-5.4 mini'), true);
});

test('codex model guard preserves explicit supported model requests and rewrites everything else to the default', () => {
  assert.deepEqual(forceRequiredCodexModelArgs(['exec']), ['--model', 'gpt-5.6-terra', 'exec']);
  assert.deepEqual(forceRequiredCodexModelArgs(['--model', 'gpt-5.5', 'exec']), ['--model', 'gpt-5.5', 'exec']);
  assert.deepEqual(forceRequiredCodexModelArgs(['--model', 'gpt-5.4-mini', 'exec']), ['--model', 'gpt-5.4-mini', 'exec']);
  assert.deepEqual(forceRequiredCodexModelArgs(['--model', 'gpt-5.6-sol', 'exec']), ['--model', 'gpt-5.6-sol', 'exec']);
  assert.deepEqual(forceRequiredCodexModelArgs(['--model', 'gpt-5.4', 'exec']), ['--model', 'gpt-5.6-terra', 'exec']);
  assert.deepEqual(forceRequiredCodexModelConfigArgs(['-c', 'model="gpt-5.6-luna"', 'exec']), ['-c', 'model="gpt-5.6-luna"', 'exec']);
  assert.deepEqual(forceRequiredCodexModelConfigArgs(['-c', 'model="gpt-4o"', 'exec']), ['-c', 'model="gpt-5.6-terra"', 'exec']);
});

test('codex model guard honors SKS_CODEX_MODEL env only when supported and no explicit arg is present', () => {
  const saved = process.env.SKS_CODEX_MODEL;
  try {
    process.env.SKS_CODEX_MODEL = 'gpt-5.5';
    assert.deepEqual(forceRequiredCodexModelArgs(['exec']), ['--model', 'gpt-5.5', 'exec']);
    assert.deepEqual(forceRequiredCodexModelArgs(['--model', 'gpt-5.6-terra', 'exec']), ['--model', 'gpt-5.6-terra', 'exec']);
    process.env.SKS_CODEX_MODEL = 'gpt-4o';
    assert.deepEqual(forceRequiredCodexModelArgs(['exec']), ['--model', 'gpt-5.6-terra', 'exec']);
  } finally {
    if (saved === undefined) delete process.env.SKS_CODEX_MODEL;
    else process.env.SKS_CODEX_MODEL = saved;
  }
});
