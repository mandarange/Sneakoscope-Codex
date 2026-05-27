import test from 'node:test';
import assert from 'node:assert/strict';
import { createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

test('sks run --visual --execute blocks when real visual evidence is missing', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'sks-run-execute-visual-blocked' });
  const result = await runSksInRoot(root, ['run', 'review this UI screenshot', '--visual', '--execute', '--json'], { expectCode: 1 });
  assert.equal(result.schema, 'sks.run.v2');
  assert.equal(result.ok, false);
  assert.equal(result.route, '$Image-UX-Review');
  assert.equal(result.route_execution, 'blocked');
  assert.ok(result.execution.blockers.includes('visual_source_or_official_capture_evidence_missing'));
});
