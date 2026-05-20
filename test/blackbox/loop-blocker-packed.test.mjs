import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('loop blocker release check passes', () => {
  const result = spawnSync(process.execPath, ['scripts/loop-blocker-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.report.stop_required, true);
});
