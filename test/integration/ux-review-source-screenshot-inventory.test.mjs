import test from 'node:test';
import assert from 'node:assert/strict';
import { capturedInventory, importDist, tempImageRoot } from '../helpers/ux-review-1-0-8-fixtures.mjs';

test('UX-Review source screenshot inventory hydrates from a real local image', async () => {
  const imageUx = await importDist('core/image-ux-review.js');
  const { root, imagePath } = await tempImageRoot();
  const { inventory } = await capturedInventory(imageUx, root, imagePath);
  assert.equal(inventory.source_screens[0].status, 'captured');
  assert.equal(inventory.source_screens[0].privacy, 'local-only');
});
