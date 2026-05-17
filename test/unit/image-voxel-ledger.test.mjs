import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBbox } from '../../src/core/wiki-image/bbox.mjs';
import { emptyImageVoxelLedger } from '../../src/core/wiki-image/image-voxel-schema.mjs';
import { validateImageVoxelLedger } from '../../src/core/wiki-image/validation.mjs';

test('image voxel ledger validates image refs and bbox bounds', () => {
  const ledger = emptyImageVoxelLedger({
    images: [{ id: 'screen', path: 'screen.png', sha256: 'abc', width: 100, height: 80, source: 'mock' }],
    anchors: [{ id: 'a1', image_id: 'screen', bbox: [10, 10, 20, 20] }]
  });
  assert.equal(validateImageVoxelLedger(ledger).ok, true);
  assert.equal(validateBbox([90, 10, 20, 10], ledger.images[0]).ok, false);
});
