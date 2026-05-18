import test from 'node:test';
import assert from 'node:assert/strict';
import { createHermeticProjectRoot, runSksInRoot } from '../e2e/route-real-command-helper.mjs';

test('sks run visual path writes image voxel trust evidence', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'sks-run-visual' });
  const result = await runSksInRoot(root, ['run', 'review this UI screenshot', '--visual', '--mock', '--json']);
  assert.equal(result.route, '$Image-UX-Review');
  assert.equal(result.trust_status, 'verified_partial');
  assert.equal(result.trust_report.issues.length, 0);
  assert.ok(result.trust_report.evidence.evidence_records >= 1);
});
