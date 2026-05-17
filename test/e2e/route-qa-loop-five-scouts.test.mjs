import test from 'node:test';
import { assertCompletionProof, assertScoutProof, runSks } from './route-real-command-helper.mjs';

test('QA-LOOP route fixture includes five-scout proof evidence', async () => {
  const prepared = await runSks(['qa-loop', 'prepare', 'fixture UI QA', '--json']);
  const json = await runSks(['qa-loop', 'run', prepared.mission_id, '--mock', '--json']);
  await assertCompletionProof(json.mission_id, '$QA-LOOP');
  await assertScoutProof(json.mission_id);
});
