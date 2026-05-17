import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyImageVoxelLedger } from '../../src/core/wiki-image/image-voxel-schema.mjs';
import { validateImageVoxelLedger } from '../../src/core/wiki-image/validation.mjs';

test('image voxel relation validation catches missing before/after anchors', () => {
  const valid = emptyImageVoxelLedger({
    images: [
      { id: 'before', path: 'before.png', sha256: 'a', width: 10, height: 10 },
      { id: 'after', path: 'after.png', sha256: 'b', width: 10, height: 10 }
    ],
    anchors: [{ id: 'changed', image_id: 'after', bbox: [0, 0, 5, 5], label: 'changed', source: 'fixture', evidence_path: 'after.png' }],
    relations: [{ type: 'before_after', before_image_id: 'before', after_image_id: 'after', changed_anchor_ids: ['changed'] }]
  });
  assert.equal(validateImageVoxelLedger(valid, { requireAnchors: true, requireRelations: true }).ok, true);
  const invalid = { ...valid, relations: [{ ...valid.relations[0], changed_anchor_ids: ['missing'] }] };
  const validation = validateImageVoxelLedger(invalid, { requireAnchors: true, requireRelations: true });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.includes('relation_anchor:missing'));
});
