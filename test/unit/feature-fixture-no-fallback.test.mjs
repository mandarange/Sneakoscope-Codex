import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureForFeature } from '../../dist/core/feature-fixtures.js';

test('unknown feature fixtures are missing instead of implicit static pass', () => {
  const missing = fixtureForFeature('unknown-runtime-feature');
  assert.equal(missing.kind, 'not_available');
  assert.equal(missing.status, 'missing');
  assert.equal(missing.fallback_removed, true);
  const skill = fixtureForFeature('skill-example');
  assert.equal(skill.status, 'pass');
  assert.equal(skill.quality, 'static_contract');
  assert.equal(fixtureForFeature('cli-update').status, 'pass');
});

test('memory retention fixture is an explicit dry run, never a bare memory command', () => {
  const fixture = fixtureForFeature('cli-memory');
  assert.equal(fixture.kind, 'execute');
  assert.equal(fixture.command, 'sks memory gc --dry-run --json');
  assert.deepEqual(fixture.expected_artifacts, []);
});
