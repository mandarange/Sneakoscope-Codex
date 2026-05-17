import test from 'node:test';
import { assertCompletionProof, assertImageAnchors, runSks } from './route-real-command-helper.mjs';

test('Computer Use route runs in a hermetic temp project root', async () => {
  const json = await runSks(['computer-use', 'import-fixture', '--mock', '--json']);
  await assertCompletionProof(json.mission_id, '$Computer-Use');
  await assertImageAnchors(json.mission_id);
});
