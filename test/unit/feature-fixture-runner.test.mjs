import test from 'node:test';
import assert from 'node:assert/strict';
import { runFeatureFixture } from '../../src/core/feature-fixture-runner.mjs';

test('feature fixture runner validates expected artifact schemas', () => {
  const result = runFeatureFixture({
    id: 'route-qa-loop',
    fixture: {
      kind: 'mock',
      command: 'sks qa-loop run latest --mock --json',
      expected_artifacts: [
        { path: '.sneakoscope/missions/<latest>/completion-proof.json', schema: 'sks.completion-proof.v1' },
        { path: '.sneakoscope/missions/<latest>/image-voxel-ledger.json', schema: 'sks.image-voxel-ledger.v1' }
      ],
      status: 'pass'
    }
  }, { validateArtifacts: true });
  assert.equal(result.ok, true);
  assert.equal(result.expected_artifacts.length, 2);
  assert.equal(result.expected_artifacts.every((artifact) => artifact.schema_ok), true);
});
