import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeRouteCompletionProof } from '../../src/core/proof/route-adapter.mjs';
import { validateRouteCompletionProof } from '../../src/core/proof/route-proof-gate.mjs';
import { emptyImageVoxelLedger } from '../../src/core/wiki-image/image-voxel-schema.mjs';
import { addVisualAnchor, writeImageVoxelLedger } from '../../src/core/wiki-image/image-voxel-ledger.mjs';

test('PPT fixture links generated visual evidence to image voxel proof anchors', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-ppt-fixture-'));
  const missionId = 'M-ppt-fixture';
  await writeImageVoxelLedger(root, emptyImageVoxelLedger({
    images: [{ id: 'ppt-slide-review', path: 'ppt-review.png', sha256: 'fixture', width: 1280, height: 720 }]
  }));
  const anchor = await addVisualAnchor(root, {
    imageId: 'ppt-slide-review',
    bbox: [80, 90, 320, 140],
    label: 'Slide hierarchy callout',
    source: 'gpt-image-2-annotated-review',
    route: '$PPT',
    evidencePath: 'ppt-review-ledger.json'
  });
  assert.equal(anchor.ok, true);
  await writeRouteCompletionProof(root, {
    missionId,
    route: '$PPT',
    status: 'verified',
    gate: { passed: true },
    artifacts: ['ppt-image-asset-ledger.json', 'ppt-review-ledger.json', 'ppt-render-report.json', 'image-voxel-ledger.json', 'completion-proof.json'],
    evidence: { image_voxels: { anchors: 1, anchor_count: 1, images: 1, status: 'fixture' } },
    claims: [{ id: 'ppt-image-anchor-fixture', status: 'fixture', text: 'PPT fixture proof has image voxel anchor evidence.' }]
  });
  const proofGate = await validateRouteCompletionProof(root, { missionId, route: '$PPT' });
  assert.equal(proofGate.ok, true);
});
