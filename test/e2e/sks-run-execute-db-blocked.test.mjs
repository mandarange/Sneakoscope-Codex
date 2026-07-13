import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

test('sks run --db --execute blocks destructive DB prompts', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'sks-run-execute-db-blocked' });
  const result = await runSksInRoot(root, ['run', 'drop table users', '--db', '--execute', '--json'], { expectCode: 1 });
  assert.equal(result.schema, 'sks.run.v2');
  assert.equal(result.ok, false);
  assert.equal(result.route, '$DB');
  assert.equal(result.route_execution, 'blocked');
  assert.ok(result.execution.blockers.includes('destructive_db_auto_execute_blocked'));
  assert.match(result.next_action, /\$DB|mad-sks/i);
});

test('sks run --db --execute materializes internal read-only DB artifacts without reviving sks db', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'sks-run-execute-db-internal' });
  const result = await runSksInRoot(root, ['run', 'inspect migration safety', '--db', '--execute', '--json']);
  assert.equal(result.ok, true);
  assert.equal(result.route, '$DB');
  assert.equal(result.execution.command, 'internal:$DB prepare');
  assert.equal(result.execution.prompt_delivered, true);
  const nested = result.execution.nested_mission_id;
  assert.ok(nested);
  await fs.access(path.join(root, '.sneakoscope', 'missions', nested, 'db-safety-scan.json'));
  await fs.access(path.join(root, '.sneakoscope', 'missions', nested, 'db-review.json'));
});
