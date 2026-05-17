import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { finalizeRouteWithProof } from '../../src/core/proof/route-finalizer.mjs';
import { readJson } from '../../src/core/fsx.mjs';

test('route finalizer writes completion proof and visual image anchors', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-route-finalizer-'));
  const result = await finalizeRouteWithProof(root, {
    missionId: 'M-fixture',
    route: '$Image-UX-Review',
    mock: true,
    requireRelation: true,
    statusHint: 'verified_partial'
  });
  assert.equal(result.ok, true);
  assert.equal(result.proof.route, '$Image-UX-Review');
  assert.equal(result.proof.status, 'verified_partial');
  assert.equal(result.proof.evidence.image_voxels.anchor_count, 1);
  assert.equal(result.proof.evidence.image_voxels.relations, 1);
  const ledger = await readJson(path.join(root, '.sneakoscope/missions/M-fixture/image-voxel-ledger.json'));
  assert.equal(ledger.anchors.length, 1);
  assert.equal(ledger.relations.length, 1);
});
