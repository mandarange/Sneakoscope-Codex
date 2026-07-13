import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

test('sks run --research --execute prepares and runs a Research route mission', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'sks-run-execute-research' });
  const result = await runSksInRoot(root, ['run', 'research fixture migration risks', '--research', '--execute', '--json'], { expectCode: 1 });
  assert.equal(result.schema, 'sks.run.v2');
  assert.equal(result.ok, false);
  assert.equal(result.route, '$Research');
  assert.equal(result.route_execution, 'verified_partial');
  assert.equal(result.status, 'mock_only');
  assert.ok(result.execution.nested_mission_id);
  assert.equal(result.execution.execution_class, 'mock_fixture');
  assert.equal(result.execution.completion_evidence, false);
  assert.equal(result.execution.trust_status, 'mock_only');
  assert.deepEqual(result.execution.steps.map((step) => step.label), ['prepare', 'run']);
  assert.ok(result.execution.unverified.some((entry) => /mock-safe fixtures/.test(entry)));
  const missionDir = path.join(root, '.sneakoscope', 'missions', result.mission_id);
  const gate = JSON.parse(await fs.readFile(path.join(missionDir, 'run-gate.json'), 'utf8'));
  const proof = JSON.parse(await fs.readFile(path.join(missionDir, 'completion-proof.json'), 'utf8'));
  assert.equal(gate.passed, false);
  assert.equal(gate.execution_class, 'mock_fixture');
  assert.ok(gate.blockers.includes('run_execute_mock_only_not_real_completion'));
  assert.equal(proof.status, 'mock_only');
  assert.equal(proof.execution_class, 'mock_fixture');
});
