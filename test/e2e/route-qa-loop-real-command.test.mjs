import test from 'node:test';
import { assertCompletionProof, assertImageAnchors, runSks } from './route-real-command-helper.mjs';

test('QA Loop real command path auto-finalizes completion proof', async () => {
  const prepared = await runSks(['qa-loop', 'prepare', 'fixture UI QA', '--json']);
  const json = await runSks(['qa-loop', 'run', prepared.mission_id, '--mock', '--json']);
  await assertCompletionProof(json.mission_id, '$QA-LOOP');
  await assertImageAnchors(json.mission_id);
});
