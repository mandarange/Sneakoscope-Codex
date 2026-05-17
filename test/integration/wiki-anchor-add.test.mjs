import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addImageRelation, addVisualAnchor, writeImageVoxelLedger } from '../../src/core/wiki-image/image-voxel-ledger.mjs';
import { emptyImageVoxelLedger } from '../../src/core/wiki-image/image-voxel-schema.mjs';

test('wiki anchor-add and relation-add APIs validate visual anchors', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-anchor-'));
  await writeImageVoxelLedger(root, emptyImageVoxelLedger({
    images: [
      { id: 'before', path: 'before.png', sha256: 'fixture', width: 100, height: 80 },
      { id: 'after', path: 'after.png', sha256: 'fixture', width: 100, height: 80 }
    ]
  }));
  const anchor = await addVisualAnchor(root, { imageId: 'before', bbox: [10, 10, 20, 20], label: 'CTA', source: 'gpt-image-2-annotated-review', route: '$Image-UX-Review' });
  assert.equal(anchor.ok, true);
  const relation = await addImageRelation(root, { beforeImageId: 'before', afterImageId: 'after', anchors: [anchor.anchor.id], route: '$Image-UX-Review' });
  assert.equal(relation.ok, true);
});
