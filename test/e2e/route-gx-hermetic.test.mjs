import test from 'node:test';
import { assertCompletionProof, assertImageAnchors, runSks } from './route-real-command-helper.mjs';

test('GX route runs in a hermetic temp project root', async () => {
  const json = await runSks(['gx', 'validate', 'fixture', '--mock', '--json']);
  await assertCompletionProof(json.mission_id, '$GX');
  await assertImageAnchors(json.mission_id);
});
