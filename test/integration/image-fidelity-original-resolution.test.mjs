import test from 'node:test';
import assert from 'node:assert/strict';
import { capturedInventory, importDist, tempImageRoot } from '../helpers/ux-review-1-0-8-fixtures.mjs';

test('original-resolution metadata is available for Image Voxel coordinate alignment', async () => {
  const imageUx = await importDist('core/image-ux-review.js');
  const { root, imagePath } = await tempImageRoot();
  const { inventory } = await capturedInventory(imageUx, root, imagePath);
  const screen = inventory.source_screens[0];
  assert.deepEqual(screen.original_resolution, { preserved: true, width: 1, height: 1 });
  assert.equal(screen.exif_orientation_normalized, 'recorded_not_rotated');
});
