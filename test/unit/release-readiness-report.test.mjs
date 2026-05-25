import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('release readiness report writes current readiness artifacts', () => {
  const result = spawnSync(process.execPath, ['scripts/release-readiness-report.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.release-readiness.v1');
  assert.equal(json.package.version, pkg.version);
  assert.equal(json.scope.gate, '1.17.0 parallel P0 DAG');
  assert.deepEqual(json.remaining_p0_gaps, []);
});
