import test from 'node:test';
import assert from 'node:assert/strict';
import { createHermeticProjectRoot, runSksInRoot } from '../e2e/route-real-command-helper.mjs';

test('scouts:selftest followed by strict scouts:check passes in a hermetic root', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'scouts-strict-check', setup: false });
  await runSksInRoot(root, ['scouts', 'run', 'latest', '--engine', 'local-static', '--mock', '--json']);
  const check = await runSksInRoot(root, ['scouts', 'validate', 'latest', '--strict', '--json']);
  assert.equal(check.ok, true);
});
