import test from 'node:test';
import assert from 'node:assert/strict';
import { computerUseEvidenceSkeleton } from '../../dist/core/computer-use-status.js';

test('Computer Use evidence skeleton never fabricates screens or actions', () => {
  const evidence = computerUseEvidenceSkeleton('external_capability_blocked');
  assert.equal(evidence.schema, 'sks.computer-use-evidence.v1');
  assert.equal(evidence.status, 'external_capability_blocked');
  assert.deepEqual(evidence.screens, []);
  assert.deepEqual(evidence.actions, []);
  assert.equal(evidence.image_voxel_linked, false);
});
