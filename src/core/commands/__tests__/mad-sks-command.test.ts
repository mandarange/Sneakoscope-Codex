import test from 'node:test';
import assert from 'node:assert/strict';
import { findGlmOnlyMadFlagBlockers, stripMadLaunchOnlyArgs } from '../mad-sks-command.js';

test('non-GLM MAD fails closed for GLM-only flags instead of silently stripping them', () => {
  assert.deepEqual(findGlmOnlyMadFlagBlockers(['--mad', '--bench'], false), ['glm_flag_requires_--glm:--bench']);
  assert.deepEqual(findGlmOnlyMadFlagBlockers(['--mad', '--trace', '--exact-provider', 'foo'], false), [
    'glm_flag_requires_--glm:--trace',
    'glm_flag_requires_--glm:--exact-provider'
  ]);
  assert.deepEqual(findGlmOnlyMadFlagBlockers(['--mad', '--glm', '--trace'], true), []);
});

test('launch sanitizer strips GLM-only flags only for GLM launches', () => {
  assert.deepEqual(stripMadLaunchOnlyArgs(['--mad', '--deep', '--exact-provider', 'foo'], { includeGlmFlags: false }), ['--deep', '--exact-provider', 'foo']);
  assert.deepEqual(stripMadLaunchOnlyArgs(['--mad', '--deep', '--exact-provider', 'foo'], { includeGlmFlags: true }), []);
});
