import test from 'node:test';
import { assertCompletionProof, assertImageAnchors, runSks } from './route-real-command-helper.mjs';

test('PPT route runs in a hermetic temp project root', async () => {
  const json = await runSks(['ppt', 'fixture', '--mock', '--json']);
  await assertCompletionProof(json.mission_id, '$PPT');
  await assertImageAnchors(json.mission_id);
});
