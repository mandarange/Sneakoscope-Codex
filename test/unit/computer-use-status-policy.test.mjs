import test from 'node:test';
import assert from 'node:assert/strict';
import { computerUseEvidenceSkeleton } from '../../dist/core/computer-use-status.js';

test('Computer Use evidence status is independent from MAD-SKS safety state', () => {
  const evidence = computerUseEvidenceSkeleton('available');
  assert.equal(evidence.schema, 'sks.computer-use-evidence.v1');
  assert.equal(evidence.status, 'available');
  assert.equal(evidence.source, 'codex-app-macos');
});
