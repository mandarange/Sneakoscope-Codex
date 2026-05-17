import test from 'node:test';
import { assertCompletionProof, assertImageAnchors, runSks } from './route-real-command-helper.mjs';

test('GX validate fixture command auto-finalizes proof and image anchors', async () => {
  const json = await runSks(['gx', 'validate', 'fixture', '--mock', '--json']);
  await assertCompletionProof(json.mission_id, '$GX');
  await assertImageAnchors(json.mission_id);
});
