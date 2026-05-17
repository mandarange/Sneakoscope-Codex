import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeRouteCompletionProof } from '../../src/core/proof/route-adapter.mjs';
import { validateRouteCompletionProof } from '../../src/core/proof/route-proof-gate.mjs';
import { emptyImageVoxelLedger } from '../../src/core/wiki-image/image-voxel-schema.mjs';
import { addVisualAnchor, writeImageVoxelLedger } from '../../src/core/wiki-image/image-voxel-ledger.mjs';

test('Image UX Review fixture requires generated review image anchors in proof gate', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-image-ux-fixture-'));
  const missionId = 'M-image-ux-fixture';
  await writeImageVoxelLedger(root, emptyImageVoxelLedger({
    images: [{ id: 'image-ux-generated-review', path: 'generated-review.png', sha256: 'fixture', width: 1440, height: 900 }]
  }));
  const anchor = await addVisualAnchor(root, {
    imageId: 'image-ux-generated-review',
    bbox: [120, 240, 360, 80],
    label: 'CTA contrast issue',
    source: 'gpt-image-2-annotated-review',
    route: '$Image-UX-Review',
    evidencePath: 'image-ux-generated-review-ledger.json'
  });
  assert.equal(anchor.ok, true);
  await writeRouteCompletionProof(root, {
    missionId,
    route: '$Image-UX-Review',
    status: 'verified',
    gate: { passed: true },
    artifacts: ['image-ux-screen-inventory.json', 'image-ux-generated-review-ledger.json', 'image-ux-issue-ledger.json', 'image-voxel-ledger.json', 'completion-proof.json'],
    evidence: { image_voxels: { anchors: 1, anchor_count: 1, images: 1, status: 'fixture' } },
    claims: [{ id: 'image-ux-anchor-fixture', status: 'fixture', text: 'Image UX fixture proof has generated review anchor evidence.' }]
  });
  const proofGate = await validateRouteCompletionProof(root, { missionId, route: '$Image-UX-Review' });
  assert.equal(proofGate.ok, true);
});
