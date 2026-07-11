import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGlmSlashModelSelection,
  resolveGlmProfileFromArgs,
  stripGlmSlashModelArgs
} from '../glm-profile-resolver.js';

test('GLM slash model selector parses reasoning effort and strips selector tokens', () => {
  assert.deepEqual(parseGlmSlashModelSelection(['/model', 'z-ai/glm-5.2', 'xhigh']), {
    model: 'z-ai/glm-5.2',
    reasoning_effort: 'xhigh',
    consumed_indexes: [0, 1, 2],
    blockers: []
  });
  assert.deepEqual(stripGlmSlashModelArgs(['run', '/model', 'high', 'fix src/a.ts']), ['run', 'fix src/a.ts']);
  assert.equal(resolveGlmProfileFromArgs(['/model', 'medium']).name, 'speed');
  assert.equal(resolveGlmProfileFromArgs(['/model', 'high']).name, 'deep');
  assert.equal(resolveGlmProfileFromArgs(['/model', 'xhigh']).name, 'xhigh');
});

test('GLM slash model selector blocks non-GLM model choices without changing model lock', () => {
  const profile = resolveGlmProfileFromArgs(['/model', 'gpt-5.6-terra', 'high']);
  assert.equal(profile.name, 'deep');
  assert.deepEqual(profile.blockers, ['glm_slash_model_mismatch:gpt-5.6-terra']);
});
