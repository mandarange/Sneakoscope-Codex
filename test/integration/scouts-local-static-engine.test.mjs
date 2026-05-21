import test from 'node:test';
import assert from 'node:assert/strict';
import { createHermeticProjectRoot, runSksInRoot } from '../e2e/route-real-command-helper.mjs';

test('scouts local-static engine runs deterministic five-scout intake', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'scouts-local-static', setup: false });
  const json = await runSksInRoot(root, ['scouts', 'run', 'latest', '--engine', 'local-static', '--mock', '--json']);
  assert.equal(json.engine, 'local-static');
  assert.equal(json.completed_scouts, 5);
  assert.equal(json.performance.claim_allowed, false);
});
