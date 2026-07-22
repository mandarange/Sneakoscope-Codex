import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNonGlmMadRoute, resolveSksModelMode } from '../../routes/model-mode-router.js';
import { findGlmOnlyMadFlagBlockers } from '../mad-sks-command.js';

test('sks --mad stays GPT/MAD and GLM-free without OpenRouter key', () => {
  const prev = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const resolved = assertNonGlmMadRoute(['--mad', '--dry-run', '--json']);
    assert.equal(resolved.mode, 'gpt-mad');
    assert.equal(resolved.glm_enabled, false);
  } finally {
    if (prev !== undefined) process.env.OPENROUTER_API_KEY = prev;
  }
});

test('retired GLM MAD flags are blocked even when --glm is present', () => {
  assert.deepEqual(findGlmOnlyMadFlagBlockers(['--mad', '--bench'], false), ['retired_glm_mad_flag:--bench']);
  assert.deepEqual(findGlmOnlyMadFlagBlockers(['--mad', '--glm', '--bench'], true), [
    'retired_glm_mad_flag:--glm',
    'retired_glm_mad_flag:--bench'
  ]);
  const resolved = resolveSksModelMode(['--mad', '--glm', '--bench']);
  assert.equal(resolved.mode, 'unknown');
  assert.equal(resolved.reason, 'glm_mad_removed');
});
