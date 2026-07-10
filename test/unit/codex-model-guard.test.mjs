import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GPT56_CODEX_MODELS,
  REQUIRED_CODEX_MODEL,
  SUPPORTED_CODEX_MODELS,
  forceGpt55CodexArgs,
  forceGpt55CodexConfigArgs,
  isForbiddenCodexModel
} from '../../dist/core/codex-model-guard.js';

test('codex model guard supports gpt-5.4-mini and the gpt-5.6 trio while keeping gpt-5.5 as the forced default', () => {
  assert.equal(REQUIRED_CODEX_MODEL, 'gpt-5.5');
  assert.deepEqual(GPT56_CODEX_MODELS, ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']);
  assert.deepEqual(SUPPORTED_CODEX_MODELS, ['gpt-5.5', 'gpt-5.4-mini', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']);
  assert.equal(isForbiddenCodexModel('gpt-5.5'), false);
  assert.equal(isForbiddenCodexModel('gpt-5.4-mini'), false);
  assert.equal(isForbiddenCodexModel('gpt-5.6-sol'), false);
  assert.equal(isForbiddenCodexModel('gpt-5.6-terra'), false);
  assert.equal(isForbiddenCodexModel('gpt-5.6-luna'), false);
  assert.equal(isForbiddenCodexModel('gpt-5.6'), true);
  assert.equal(isForbiddenCodexModel('gpt-5.4'), true);
  assert.equal(isForbiddenCodexModel('gpt-5.4 mini'), true);
});

test('codex model guard preserves explicit supported model requests and rewrites everything else to gpt-5.5', () => {
  assert.deepEqual(forceGpt55CodexArgs(['exec']), ['--model', 'gpt-5.5', 'exec']);
  assert.deepEqual(forceGpt55CodexArgs(['--model', 'gpt-5.4-mini', 'exec']), ['--model', 'gpt-5.4-mini', 'exec']);
  assert.deepEqual(forceGpt55CodexArgs(['--model', 'gpt-5.6-sol', 'exec']), ['--model', 'gpt-5.6-sol', 'exec']);
  assert.deepEqual(forceGpt55CodexArgs(['--model', 'gpt-5.4', 'exec']), ['--model', 'gpt-5.5', 'exec']);
  assert.deepEqual(forceGpt55CodexConfigArgs(['-c', 'model="gpt-5.6-luna"', 'exec']), ['-c', 'model="gpt-5.6-luna"', 'exec']);
  assert.deepEqual(forceGpt55CodexConfigArgs(['-c', 'model="gpt-4o"', 'exec']), ['-c', 'model="gpt-5.5"', 'exec']);
});

test('codex model guard honors SKS_CODEX_MODEL env only when supported and no explicit arg is present', () => {
  const saved = process.env.SKS_CODEX_MODEL;
  try {
    process.env.SKS_CODEX_MODEL = 'gpt-5.6-terra';
    assert.deepEqual(forceGpt55CodexArgs(['exec']), ['--model', 'gpt-5.6-terra', 'exec']);
    assert.deepEqual(forceGpt55CodexArgs(['--model', 'gpt-5.5', 'exec']), ['--model', 'gpt-5.5', 'exec']);
    process.env.SKS_CODEX_MODEL = 'gpt-4o';
    assert.deepEqual(forceGpt55CodexArgs(['exec']), ['--model', 'gpt-5.5', 'exec']);
  } finally {
    if (saved === undefined) delete process.env.SKS_CODEX_MODEL;
    else process.env.SKS_CODEX_MODEL = saved;
  }
});
