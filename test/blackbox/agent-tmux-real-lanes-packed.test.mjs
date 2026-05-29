import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed blackbox proves Zellij lane pane evidence', () => {
  const result = spawnSync(process.execPath, ['scripts/zellij-pane-proof-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
