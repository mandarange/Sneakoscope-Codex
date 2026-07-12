import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed $Naruto official subagent workflow gate passes through the compatibility entrypoint', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/naruto-shadow-clone-swarm-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
