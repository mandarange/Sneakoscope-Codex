import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNonGlmMadRoute, resolveSksModelMode } from '../model-mode-router.js';

test('resolveSksModelMode keeps GPT MAD and classic Naruto without GLM modes', () => {
  assert.equal(resolveSksModelMode(['--mad']).mode, 'gpt-mad');
  assert.equal(resolveSksModelMode(['naruto']).mode, 'classic-naruto');
  assert.equal(resolveSksModelMode(['--mad', '--glm']).mode, 'unknown');
  assert.equal(resolveSksModelMode(['naruto', '--glm']).mode, 'unknown');
  assert.equal(resolveSksModelMode(['--mad', '--glm']).glm_enabled, false);
});

test('assertNonGlmMadRoute accepts plain MAD', () => {
  assert.equal(assertNonGlmMadRoute(['--mad']).mode, 'gpt-mad');
  assert.throws(() => assertNonGlmMadRoute(['--mad', '--glm']), /sks_mad_route_glm_leak/);
});
