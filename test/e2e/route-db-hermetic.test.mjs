import test from 'node:test';
import { assertCompletionProof, runSks } from './route-real-command-helper.mjs';

test('DB route runs in a hermetic temp project root', async () => {
  const json = await runSks(['db', 'check', '--sql', 'SELECT 1', '--json']);
  await assertCompletionProof(json.mission_id || json.completion_proof?.mission_id, '$DB');
});
