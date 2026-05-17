import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProofRoute,
  routeRequiresCompletionProof,
  routeRequiresImageVoxelAnchors
} from '../../src/core/proof/route-proof-policy.mjs';

test('route proof policy normalizes serious and visual aliases', () => {
  assert.equal(normalizeProofRoute('qa-loop'), '$QA-LOOP');
  assert.equal(normalizeProofRoute('visual-review'), '$Visual-Review');
  assert.equal(routeRequiresCompletionProof('$Team'), true);
  assert.equal(routeRequiresCompletionProof('$Commit'), false);
  assert.equal(routeRequiresImageVoxelAnchors('$Computer-Use'), true);
  assert.equal(routeRequiresImageVoxelAnchors('$DB'), false);
});
