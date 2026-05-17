import test from 'node:test';
import { assertCompletionProofInRoot, createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

test('Research route fixture includes five-scout proof evidence', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'research-scouts' });
  const prepared = await runSksInRoot(root, ['research', 'prepare', 'fixture research topic', '--json']);
  const json = await runSksInRoot(root, ['research', 'run', prepared.mission_id, '--mock', '--json']);
  const proof = await assertCompletionProofInRoot(root, json.mission_id, '$Research');
  const scouts = proof.evidence.scouts;
  if (!scouts) throw new Error('missing scout proof');
  await fs.access(path.join(root, '.sneakoscope', 'missions', json.mission_id, 'scout-gate.json'));
});
