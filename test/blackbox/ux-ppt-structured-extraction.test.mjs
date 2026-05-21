import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

test('UX/PPT structured extraction schemas are strict', () => {
  const run = spawnSync(process.execPath, ['scripts/ux-ppt-structured-extraction-check.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const parsed = JSON.parse(run.stdout);
  assert.equal(parsed.ok, true);
});
