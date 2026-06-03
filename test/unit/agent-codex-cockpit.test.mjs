import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('agent cockpit check writes Codex App dashboard artifacts', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/agent-codex-app-cockpit-check.js'], { encoding: 'utf8' });
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.agent-codex-app-cockpit-check.v1');
  assert.deepEqual(json.issues, []);
  assert.equal(result.status, 0);
});
