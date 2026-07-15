import test from 'node:test';
import assert from 'node:assert/strict';
import { assertGlmRoute, assertNonGlmMadRoute, resolveSksModelMode } from '../../../routes/model-mode-router.js';

test('GLM routes require explicit --glm and classify Naruto variants', () => {
  assert.equal(resolveSksModelMode(['--mad', '--glm']).mode, 'glm-direct');
  assert.equal(resolveSksModelMode(['--mad', '--glm', 'naruto']).mode, 'glm-naruto');
  assert.equal(resolveSksModelMode(['naruto', '--glm']).mode, 'classic-naruto');
  assert.equal(resolveSksModelMode(['naruto', '--glm']).glm_enabled, false);
  assert.throws(() => assertGlmRoute(['--mad']), /sks_glm_route_required/);
  assert.throws(() => assertNonGlmMadRoute(['--mad', '--glm']), /sks_mad_route_glm_leak/);
});
