import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyImageVoxelLedger } from '../../src/core/wiki-image/image-voxel-schema.mjs';
import { validateImageVoxelLedger } from '../../src/core/wiki-image/validation.mjs';

test('visual route ledger requires anchors and bbox dimensions', () => {
  const noAnchor = emptyImageVoxelLedger({
    images: [{ id: 'screen', path: 'screen.png', sha256: 'fixture', width: 100, height: 80 }]
  });
  assert.equal(validateImageVoxelLedger(noAnchor, { requireAnchors: true, route: '$Image-UX-Review' }).ok, false);

  const outOfBounds = emptyImageVoxelLedger({
    images: [{ id: 'screen', path: 'screen.png', sha256: 'fixture', width: 100, height: 80 }],
    anchors: [{ id: 'a1', image_id: 'screen', bbox: [90, 70, 20, 20] }]
  });
  const validation = validateImageVoxelLedger(outOfBounds, { requireAnchors: true });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => issue.includes('bbox_width_out_of_bounds')));
});
