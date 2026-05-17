import test from 'node:test';
import { assertCompletionProof, assertImageAnchors, runSks } from './route-real-command-helper.mjs';

test('Wiki image ingest command auto-finalizes proof and image anchors', async () => {
  const json = await runSks(['wiki', 'image-ingest', 'test/fixtures/images/one-by-one.png', '--json']);
  await assertCompletionProof(json.mission_id, '$Wiki');
  await assertImageAnchors(json.mission_id);
});
