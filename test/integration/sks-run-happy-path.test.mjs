import test from 'node:test';
import assert from 'node:assert/strict';
import { createHermeticProjectRoot, runSksInRoot } from '../e2e/route-real-command-helper.mjs';

test('sks run mock happy path reaches trust report without route jargon', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'sks-run-happy' });
  const result = await runSksInRoot(root, ['run', 'fix the fixture bug', '--mock', '--json']);
  assert.equal(result.schema, 'sks.run.v1');
  assert.equal(result.route, '$Team');
  assert.equal(result.trust_status, 'verified_partial');
  assert.equal(result.trust_report.issues.length, 0);
});
