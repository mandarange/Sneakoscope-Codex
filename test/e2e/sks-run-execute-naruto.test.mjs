import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

test('sks run --execute refuses an implicit Naruto fallback and points to the direct command', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'sks-run-execute-naruto' });
  const result = await runSksInRoot(root, ['run', 'fix the fixture bug', '--execute', '--json'], { expectCode: 1 });
  assert.equal(result.schema, 'sks.run.v2');
  assert.equal(result.ok, false);
  assert.equal(result.route, '$Naruto');
  assert.equal(result.route_execution, 'blocked');
  assert.ok(result.execution.blockers.includes('route_not_executable:$Naruto'));
  assert.match(result.next_action, /run it directly via its own sks command/i);
  const proof = JSON.parse(await fs.readFile(path.join(root, '.sneakoscope', 'missions', result.mission_id, 'completion-proof.json'), 'utf8'));
  assert.equal(proof.schema, 'sks.completion-proof.v1');
  assert.equal(proof.route, '$Naruto');
});
