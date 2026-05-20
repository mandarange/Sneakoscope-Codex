import test from 'node:test';
import assert from 'node:assert/strict';
import { capturedInventory, importDist, tempImageRoot } from '../helpers/ux-review-1-0-8-fixtures.mjs';

test('UX-Review source screenshot inventory preserves original-resolution metadata', async () => {
  const imageUx = await importDist('core/image-ux-review.js');
  const { root, imagePath } = await tempImageRoot();
  const { inventory } = await capturedInventory(imageUx, root, imagePath);
  assert.equal(inventory.passed, true);
  assert.equal(inventory.source_screens[0].width, 1);
  assert.equal(inventory.source_screens[0].height, 1);
  assert.equal(inventory.source_screens[0].original_resolution.preserved, true);
  assert.match(inventory.source_screens[0].sha256, /^[a-f0-9]{64}$/);
});
