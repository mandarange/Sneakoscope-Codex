import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureForFeature } from '../../src/core/feature-fixtures.mjs';

test('unknown feature fixtures are missing instead of implicit static pass', () => {
  const missing = fixtureForFeature('unknown-runtime-feature');
  assert.equal(missing.kind, 'not_available');
  assert.equal(missing.status, 'missing');
  assert.equal(missing.fallback_removed, true);
  const skill = fixtureForFeature('skill-example');
  assert.equal(skill.status, 'pass');
  assert.equal(skill.quality, 'static_contract');
});
