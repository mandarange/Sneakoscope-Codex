import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('project session namespace isolates same mission id across project roots', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/agent-multi-project-isolation-check.js'], { encoding: 'utf8' });
  assert.equal(result.error, undefined, `isolation check spawn failed: ${result.error?.message || 'unknown error'}`);
  assert.equal(result.signal, null, `isolation check terminated by signal ${result.signal}; stderr=${result.stderr}`);
  assert.equal(result.status, 0, `isolation check exited ${result.status}; stderr=${result.stderr}`);
  assert.ok(result.stdout.trim(), `isolation check returned empty stdout; stderr=${result.stderr}`);
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.agent-multi-project-isolation-check.v1');
  assert.deepEqual(json.issues, []);
});
