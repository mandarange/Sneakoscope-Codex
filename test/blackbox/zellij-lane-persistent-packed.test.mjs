import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Zellij lane layout remains valid', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/zellij-layout-valid-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
