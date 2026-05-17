import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addImageRelation, addVisualAnchor, writeImageVoxelLedger } from '../../src/core/wiki-image/image-voxel-ledger.mjs';
import { emptyImageVoxelLedger } from '../../src/core/wiki-image/image-voxel-schema.mjs';

test('wiki relation-add validates before after image refs and changed anchors', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-relation-'));
  await writeImageVoxelLedger(root, emptyImageVoxelLedger({
    images: [
      { id: 'before', path: 'before.png', sha256: 'before-sha', width: 20, height: 20 },
      { id: 'after', path: 'after.png', sha256: 'after-sha', width: 20, height: 20 }
    ]
  }));
  const anchor = await addVisualAnchor(root, {
    imageId: 'after',
    bbox: [1, 1, 5, 5],
    label: 'changed region',
    source: 'fixture',
    evidencePath: 'after.png',
    route: '$Computer-Use'
  });
  const relation = await addImageRelation(root, {
    beforeImageId: 'before',
    afterImageId: 'after',
    anchors: [anchor.anchor.id],
    route: '$Computer-Use'
  });
  assert.equal(relation.ok, true);
  assert.equal(relation.relation.type, 'before_after');
});
