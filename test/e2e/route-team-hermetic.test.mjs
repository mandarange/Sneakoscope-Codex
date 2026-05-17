import test from 'node:test';
import { assertCompletionProof, runSks } from './route-real-command-helper.mjs';

test('Team route runs in a hermetic temp project root', async () => {
  const json = await runSks(['team', 'fixture', '--mock', '--json']);
  await assertCompletionProof(json.mission_id, '$Team');
});
