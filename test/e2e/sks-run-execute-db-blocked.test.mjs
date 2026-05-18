import test from 'node:test';
import assert from 'node:assert/strict';
import { createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

test('sks run --db --execute blocks destructive DB prompts', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'sks-run-execute-db-blocked' });
  const result = await runSksInRoot(root, ['run', 'drop table users', '--db', '--execute', '--json'], { expectCode: 1 });
  assert.equal(result.schema, 'sks.run.v2');
  assert.equal(result.ok, false);
  assert.equal(result.route, '$DB');
  assert.equal(result.route_execution, 'blocked');
  assert.ok(result.execution.blockers.includes('destructive_db_auto_execute_blocked'));
  assert.match(result.next_action, /migration-only|db check/i);
});
