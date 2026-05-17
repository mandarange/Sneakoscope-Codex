import test from 'node:test';
import { assertCompletionProofInRoot, assertImageAnchorsInRoot, createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

test('QA Loop real command path auto-finalizes completion proof', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'qa-loop-real' });
  const prepared = await runSksInRoot(root, ['qa-loop', 'prepare', 'fixture UI QA', '--json']);
  const json = await runSksInRoot(root, ['qa-loop', 'run', prepared.mission_id, '--mock', '--json']);
  await assertCompletionProofInRoot(root, json.mission_id, '$QA-LOOP');
  await assertImageAnchorsInRoot(root, json.mission_id);
});
