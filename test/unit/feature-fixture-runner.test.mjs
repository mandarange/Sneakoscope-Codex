import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runFeatureFixture } from '../../src/core/feature-fixture-runner.mjs';

test('feature fixture runner validates expected artifact schemas', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-feature-runner-test-'));
  const missionId = 'M-feature-fixture-test';
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'completion-proof.json'), JSON.stringify({
    schema: 'sks.completion-proof.v1',
    status: 'verified_partial'
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'image-voxel-ledger.json'), JSON.stringify({
    schema: 'sks.image-voxel-ledger.v1',
    images: [{ id: 'image-1' }],
    anchors: [{ id: 'anchor-1', image_id: 'image-1', bbox: [0, 0, 1, 1] }],
    relations: []
  }, null, 2));
  const result = runFeatureFixture({
    id: 'route-qa-loop',
    fixture: {
      kind: 'execute_and_validate_artifacts',
      command: 'sks qa-loop run latest --mock --json',
      expected_artifacts: [
        { path: 'completion-proof.json', schema: 'sks.completion-proof.v1' },
        { path: 'image-voxel-ledger.json', schema: 'sks.image-voxel-ledger.v1' }
      ],
      status: 'pass'
    }
  }, { root, execute: true, validateArtifacts: true, commandArgs: { command: [] } });
  assert.equal(result.ok, true);
  assert.equal(result.expected_artifacts.length, 2);
  assert.equal(result.expected_artifacts.every((artifact) => artifact.schema_ok), true);
});
