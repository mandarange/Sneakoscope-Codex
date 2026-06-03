import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed cockpit check passes', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/agent-codex-app-cockpit-check.js'], { encoding: 'utf8' });
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(result.status, 0);
});
