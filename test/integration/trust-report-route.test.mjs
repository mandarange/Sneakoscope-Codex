import test from 'node:test';
import assert from 'node:assert/strict';
import { createHermeticProjectRoot, runSksInRoot } from '../e2e/route-real-command-helper.mjs';

test('real route command writes trust report through finalization path', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'trust-report-route' });
  const run = await runSksInRoot(root, ['run', 'fix the trust fixture', '--mock', '--json'], { expectCode: 1 });
  const report = await runSksInRoot(root, ['trust', 'report', run.mission_id, '--json']);
  assert.ok(run.mission_id);
  assert.equal(report.schema, 'sks.trust-report.v1');
  assert.equal(report.route, '$Naruto');
  assert.equal(report.status, 'blocked');
});
