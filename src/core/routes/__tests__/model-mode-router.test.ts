import test from 'node:test';
import assert from 'node:assert/strict';
import { assertGlmRoute, assertNonGlmMadRoute, resolveSksModelMode } from '../model-mode-router.js';

test('model mode resolves MAD without GLM as GPT/MAD preserved', () => {
  const resolved = resolveSksModelMode(['--mad', '--dry-run']);
  assert.equal(resolved.mode, 'gpt-mad');
  assert.equal(resolved.glm_enabled, false);
  assert.equal(resolved.gpt_mad_preserved, true);
  assert.doesNotThrow(() => assertNonGlmMadRoute(['--mad', '--dry-run']));
});

test('model mode resolves explicit GLM routes only from --glm', () => {
  assert.equal(resolveSksModelMode(['--mad', '--glm']).mode, 'glm-direct');
  assert.equal(resolveSksModelMode(['--mad', '--glm', '--naruto']).mode, 'glm-naruto');
  assert.equal(resolveSksModelMode(['naruto', '--glm']).mode, 'glm-naruto');
  assert.equal(resolveSksModelMode(['naruto']).mode, 'classic-naruto');
  assert.doesNotThrow(() => assertGlmRoute(['sks', 'naruto', '--glm']));
});

test('saved OpenRouter environment cannot change non-GLM MAD mode', () => {
  const prev = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'sk-or-saved';
  try {
    assert.equal(resolveSksModelMode(['--mad']).mode, 'gpt-mad');
  } finally {
    if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prev;
  }
});
