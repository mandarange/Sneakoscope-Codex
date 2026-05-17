import test from 'node:test';
import { assertImageAnchors, runSks } from './route-real-command-helper.mjs';

test('Image UX Review route runs in a hermetic temp project root', async () => {
  const json = await runSks(['image-ux-review', 'fixture', '--mock', '--json']);
  await assertImageAnchors(json.mission_id);
});
