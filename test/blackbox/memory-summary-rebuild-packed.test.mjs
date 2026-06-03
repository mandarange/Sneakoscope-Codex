import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('memory summary rebuild release check passes', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/memory-summary-rebuild-check.js'], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).ok, true);
});
