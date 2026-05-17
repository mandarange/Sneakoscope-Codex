import test from 'node:test';
import { assertCompletionProof, runSks } from './route-real-command-helper.mjs';

test('DB check command auto-finalizes completion proof', async () => {
  const json = await runSks(['db', 'check', '--sql', 'SELECT 1', '--json']);
  await assertCompletionProof(json.completion_proof.mission_id, '$DB');
});
