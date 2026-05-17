import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { finalizeRouteWithProof } from '../../src/core/proof/route-finalizer.mjs';

test('serious route finalizer covers representative route classes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-route-finalizer-all-'));
  const routes = ['$Team', '$Research', '$QA-LOOP', '$Computer-Use', '$GX', '$DB', '$Goal', '$MAD-SKS'];
  for (const route of routes) {
    const result = await finalizeRouteWithProof(root, {
      missionId: `M-${route.replace(/[^A-Za-z0-9]+/g, '-')}`,
      route,
      mock: true,
      requireRelation: route === '$Computer-Use',
      statusHint: 'verified_partial'
    });
    assert.equal(result.ok, true, route);
    assert.equal(result.proof.route, route);
    if (['$QA-LOOP', '$Computer-Use', '$GX'].includes(route)) {
      assert.ok(result.proof.evidence.image_voxels.anchor_count >= 1, route);
    }
  }
});
