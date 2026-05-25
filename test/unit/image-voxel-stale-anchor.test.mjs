import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImageVoxelLedger } from '../../dist/core/wiki-image/validation.js';

test('image voxel validation blocks stale anchors from supporting visual confidence', () => {
  const ledger = {
    schema: 'sks.image-voxel-ledger.v1',
    images: [{ id: 'img-1', path: 'screen.png', sha256: 'abc', width: 100, height: 100 }],
    anchors: [{
      id: 'anchor-1',
      image_id: 'img-1',
      bbox: [0, 0, 10, 10],
      label: 'stale',
      voxel_layers: { fresh: 0 }
    }],
    relations: []
  };
  const result = validateImageVoxelLedger(ledger, { requireAnchors: true, route: '$Image-UX-Review' });
  assert.equal(result.ok, false);
  assert.ok(result.issues.includes('stale_anchor:anchor-1'));
});
