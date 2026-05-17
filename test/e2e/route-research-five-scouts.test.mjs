import test from 'node:test';
import { assertCompletionProof, assertScoutProof, runSks } from './route-real-command-helper.mjs';

test('Research route fixture includes five-scout proof evidence', async () => {
  const prepared = await runSks(['research', 'prepare', 'fixture research topic', '--json']);
  const json = await runSks(['research', 'run', prepared.mission_id, '--mock', '--json']);
  await assertCompletionProof(json.mission_id, '$Research');
  await assertScoutProof(json.mission_id);
});
