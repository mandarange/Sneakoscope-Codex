import test from 'node:test';
import assert from 'node:assert/strict';
import { runSks } from './route-real-command-helper.mjs';

test('legacy DB CLI is absent from the public command router', async () => {
  const json = await runSks(['db', 'check', '--sql', 'SELECT 1', '--json'], { expectCode: 1 });
  assert.equal(json.status, 'blocked');
  assert.equal(json.command, 'db');
  assert.equal(json.reason, 'unknown_command');
});
