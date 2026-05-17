import test from 'node:test';
import { assertCompletionProof, runSks } from './route-real-command-helper.mjs';

test('Research real command path auto-finalizes completion proof', async () => {
  const prepared = await runSks(['research', 'prepare', 'fixture research topic', '--json']);
  const json = await runSks(['research', 'run', prepared.mission_id, '--mock', '--json']);
  await assertCompletionProof(json.mission_id, '$Research');
});
