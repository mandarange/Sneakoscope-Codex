import test from 'node:test';
import assert from 'node:assert/strict';
import { createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

test('sks run --research --execute prepares and runs a Research route mission', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'sks-run-execute-research' });
  const result = await runSksInRoot(root, ['run', 'research fixture migration risks', '--research', '--execute', '--json']);
  assert.equal(result.schema, 'sks.run.v1');
  assert.equal(result.ok, true);
  assert.equal(result.route, '$Research');
  assert.equal(result.route_execution, 'verified_partial');
  assert.ok(result.execution.nested_mission_id);
  assert.deepEqual(result.execution.steps.map((step) => step.label), ['prepare', 'run']);
  assert.ok(result.execution.unverified.some((entry) => /mock-safe fixtures/.test(entry)));
});
