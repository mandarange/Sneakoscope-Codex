import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

test('sks run --execute runs the Team route and writes trust artifacts', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'sks-run-execute-team' });
  const result = await runSksInRoot(root, ['run', 'fix the fixture bug', '--execute', '--json']);
  assert.equal(result.schema, 'sks.run.v2');
  assert.equal(result.ok, true);
  assert.equal(result.route, '$Team');
  assert.equal(result.route_execution, 'completed');
  assert.match(result.completion_proof, /completion-proof\.json$/);
  assert.match(result.trust_report, /trust-report\.json$/);
  const proof = JSON.parse(await fs.readFile(path.join(root, '.sneakoscope', 'missions', result.mission_id, 'completion-proof.json'), 'utf8'));
  assert.equal(proof.schema, 'sks.completion-proof.v1');
  assert.equal(proof.route, '$Team');
});
