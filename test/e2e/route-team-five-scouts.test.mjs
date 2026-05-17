import test from 'node:test';
import { assertCompletionProof, assertScoutProof, runSks } from './route-real-command-helper.mjs';

test('Team route fixture includes five-scout proof evidence', async () => {
  const json = await runSks(['team', 'fixture', '--mock', '--json']);
  await assertCompletionProof(json.mission_id, '$Team');
  await assertScoutProof(json.mission_id);
});
