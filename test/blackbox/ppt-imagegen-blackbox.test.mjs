import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

test('PPT fake imagegen blackbox produces slide review artifacts', () => {
  const run = spawnSync(process.execPath, ['dist/scripts/ppt-imagegen-blackbox-check.js'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const parsed = JSON.parse(run.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.generated_count, 1);
  assert.equal(parsed.issue_count, 1);
});
