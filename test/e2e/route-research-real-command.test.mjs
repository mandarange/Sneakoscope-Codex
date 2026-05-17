import test from 'node:test';
import { assertCompletionProofInRoot, createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

test('Research real command path auto-finalizes completion proof', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'research-real' });
  const prepared = await runSksInRoot(root, ['research', 'prepare', 'fixture research topic', '--json']);
  const json = await runSksInRoot(root, ['research', 'run', prepared.mission_id, '--mock', '--json']);
  await assertCompletionProofInRoot(root, json.mission_id, '$Research');
});
