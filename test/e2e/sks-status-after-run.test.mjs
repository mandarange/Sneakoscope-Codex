import test from 'node:test';
import assert from 'node:assert/strict';
import { createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

test('sks status points back to the outer run mission after --execute', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'sks-status-after-run' });
  const run = await runSksInRoot(root, ['run', 'fix the fixture status path', '--execute', '--json']);
  const status = await runSksInRoot(root, ['status', '--json']);
  assert.equal(status.schema, 'sks.status.v1');
  assert.equal(status.active_mission, run.mission_id);
  assert.equal(status.route, '$Team');
  assert.equal(status.proof_status, run.status);
  assert.match(status.next_action, /Honest Mode|trust validate|resolve trust blocker/i);
});
