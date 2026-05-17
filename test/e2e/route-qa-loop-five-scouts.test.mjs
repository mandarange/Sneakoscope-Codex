import test from 'node:test';
import { assertCompletionProofInRoot, createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

test('QA-LOOP route fixture includes five-scout proof evidence', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'qa-loop-scouts' });
  const prepared = await runSksInRoot(root, ['qa-loop', 'prepare', 'fixture UI QA', '--json']);
  const json = await runSksInRoot(root, ['qa-loop', 'run', prepared.mission_id, '--mock', '--json']);
  const proof = await assertCompletionProofInRoot(root, json.mission_id, '$QA-LOOP');
  const scouts = proof.evidence.scouts;
  if (!scouts) throw new Error('missing scout proof');
  await fs.access(path.join(root, '.sneakoscope', 'missions', json.mission_id, 'scout-gate.json'));
});
