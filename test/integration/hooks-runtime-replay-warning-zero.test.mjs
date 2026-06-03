import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

test('hooks runtime replay warning-zero script covers subagent events', () => {
  const run = spawnSync(process.execPath, ['dist/scripts/hooks-runtime-replay-warning-zero.js'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const parsed = JSON.parse(run.stdout);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.events.includes('SubagentStart'));
  assert.ok(parsed.events.includes('SubagentStop'));
});
