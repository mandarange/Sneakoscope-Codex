import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCompletionProofInRoot, createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

test('Research route fixture uses official subagent review evidence without legacy native-agent proof', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'research-agents' });
  const prepared = await runSksInRoot(root, ['research', 'prepare', 'fixture research topic', '--json']);
  const json = await runSksInRoot(root, ['research', 'run', prepared.mission_id, '--mock', '--json']);
  await assertCompletionProofInRoot(root, json.mission_id, '$Research');
  await fs.access(path.join(root, '.sneakoscope', 'missions', json.mission_id, 'research-adversarial-convergence.json'));
  await assert.rejects(fs.access(path.join(root, '.sneakoscope', 'missions', json.mission_id, 'research-native-agent-run.json')));
});
