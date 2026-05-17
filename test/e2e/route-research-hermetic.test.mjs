import test from 'node:test';
import { assertCompletionProofInRoot, createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

test('Research route runs in a hermetic temp project root', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'research' });
  const prepared = await runSksInRoot(root, ['research', 'prepare', 'fixture topic', '--json']);
  const json = await runSksInRoot(root, ['research', 'run', prepared.mission_id, '--mock', '--json']);
  await assertCompletionProofInRoot(root, json.mission_id, '$Research');
});
