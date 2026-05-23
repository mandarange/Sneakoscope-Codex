import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('release readiness report writes 1.15.0 readiness artifacts', () => {
  const result = spawnSync(process.execPath, ['scripts/release-readiness-report.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.release-readiness.v1');
  assert.equal(json.package.version, '1.15.0');
  assert.deepEqual(json.remaining_p0_gaps, []);
});
