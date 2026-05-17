import test from 'node:test';
import { assertCompletionProof, assertImageAnchors, runSks } from './route-real-command-helper.mjs';

test('PPT fixture command auto-finalizes completion proof and image anchors', async () => {
  const json = await runSks(['ppt', 'fixture', '--mock', '--json']);
  await assertCompletionProof(json.mission_id, '$PPT');
  await assertImageAnchors(json.mission_id);
});
