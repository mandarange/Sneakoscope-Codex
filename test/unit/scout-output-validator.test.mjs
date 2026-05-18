import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScoutResult } from '../../src/core/scouts/scout-output-validator.mjs';
import { scoutOutputJsonFixture } from '../../src/core/scouts/scout-output-fixtures.mjs';

test('validateScoutResult accepts complete scout-result output', () => {
  const result = validateScoutResult(scoutOutputJsonFixture());
  assert.equal(result.ok, true);
});

test('validateScoutResult blocks missing findings and suggested tasks by default', () => {
  const result = validateScoutResult(scoutOutputJsonFixture({ findings: [], suggested_tasks: [] }));
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('findings_missing'));
  assert.ok(result.blockers.includes('suggested_tasks_missing'));
});
