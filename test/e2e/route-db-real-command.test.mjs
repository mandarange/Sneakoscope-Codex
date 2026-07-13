import test from 'node:test';
import assert from 'node:assert/strict';
import { runSks } from './route-real-command-helper.mjs';

test('legacy DB check command cannot execute or create route artifacts', async () => {
  const json = await runSks(['db', 'check', '--sql', 'SELECT 1', '--json'], { expectCode: 1 });
  assert.equal(json.ok, false);
  assert.equal(json.reason, 'unknown_command');
});
