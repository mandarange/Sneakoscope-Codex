import test from 'node:test';
import { assertCompletionProof, assertImageAnchors, runSks } from './route-real-command-helper.mjs';

test('Image UX Review fixture command auto-finalizes proof and image anchors', async () => {
  const json = await runSks(['image-ux-review', 'fixture', '--mock', '--json']);
  await assertCompletionProof(json.mission_id, '$Image-UX-Review');
  await assertImageAnchors(json.mission_id);
});
