import test from 'node:test';
import { assertCompletionProof, runSks } from './route-real-command-helper.mjs';

test('Team real command path auto-finalizes completion proof', async () => {
  const json = await runSks(['team', 'fixture', '--mock', '--json']);
  await assertCompletionProof(json.mission_id, '$Team');
});
