import test from 'node:test';
import { assertAgentProof, assertCompletionProofInRoot, createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

test('QA-LOOP route fixture includes native agent proof evidence', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'qa-loop-agents' });
  const prepared = await runSksInRoot(root, ['qa-loop', 'prepare', 'fixture API QA', '--json']);
  const json = await runSksInRoot(root, ['qa-loop', 'run', prepared.mission_id, '--mock', '--json']);
  const proof = await assertCompletionProofInRoot(root, json.mission_id, '$QA-LOOP');
  await assertAgentProof(json.mission_id, { route: '$QA-LOOP' });
  await fs.access(path.join(root, '.sneakoscope', 'missions', json.mission_id, 'agents', 'agent-proof-evidence.json'));
});
