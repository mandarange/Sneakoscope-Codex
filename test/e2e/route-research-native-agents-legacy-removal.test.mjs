import test from 'node:test';
import { assertAgentProof, assertCompletionProofInRoot, createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

test('Research route fixture includes native agent proof evidence', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'research-agents' });
  const prepared = await runSksInRoot(root, ['research', 'prepare', 'fixture research topic', '--json']);
  const json = await runSksInRoot(root, ['research', 'run', prepared.mission_id, '--mock', '--json']);
  const proof = await assertCompletionProofInRoot(root, json.mission_id, '$Research');
  await assertAgentProof(json.mission_id, { route: '$Research' });
  await fs.access(path.join(root, '.sneakoscope', 'missions', json.mission_id, 'agents', 'agent-proof-evidence.json'));
});
