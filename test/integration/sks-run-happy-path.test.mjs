import test from 'node:test';
import assert from 'node:assert/strict';
import { createHermeticProjectRoot, runSksInRoot } from '../e2e/route-real-command-helper.mjs';

test('sks run mock does not claim Naruto trust without official subagent evidence', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'sks-run-happy' });
  const result = await runSksInRoot(root, ['run', 'fix the fixture bug', '--mock', '--json'], { expectCode: 1 });
  assert.equal(result.schema, 'sks.run.v2');
  assert.equal(result.route, '$Naruto');
  assert.equal(result.status, 'mock_only');
  assert.equal(result.trust_status, 'blocked');
  assert.ok(result.trust_report.blockers.includes('agent_gate_not_passed'));
});
