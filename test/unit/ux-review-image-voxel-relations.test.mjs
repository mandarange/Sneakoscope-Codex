import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyImageVoxelLedger } from '../../dist/core/wiki-image/image-voxel-schema.js';
import { validateImageVoxelLedger } from '../../dist/core/wiki-image/validation.js';

test('UX-Review Image Voxel relations validate source/generated references', () => {
  const ledger = emptyImageVoxelLedger({
    images: [
      { id: 'source', path: 'source.png', sha256: 'a', width: 10, height: 10 },
      { id: 'generated', path: 'generated.png', sha256: 'b', width: 10, height: 10 }
    ],
    anchors: [{ id: 'callout', image_id: 'generated', bbox: [0, 0, 5, 5], label: 'callout', source: 'gpt-image-2', evidence_path: 'generated.png' }],
    relations: [{ type: 'generated_callout_review_of', before_image_id: 'source', after_image_id: 'generated', source_image_id: 'source', generated_image_id: 'generated', changed_anchor_ids: ['callout'] }]
  });
  assert.equal(validateImageVoxelLedger(ledger, { requireRelations: true }).ok, true);
});
