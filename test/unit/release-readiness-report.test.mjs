import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('release readiness report writes current readiness artifacts', () => {
  const stamp = spawnSync(process.execPath, ['scripts/release-check-stamp.mjs', 'write'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(stamp.status, 0, `${stamp.stdout}\n${stamp.stderr}`);
  const result = spawnSync(process.execPath, ['scripts/release-readiness-report.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.release-readiness.v1');
  assert.equal(json.package.version, pkg.version);
  assert.equal(json.scope.gate, `${pkg.version} route-truth dynamic scheduler closure DAG`);
  assert.deepEqual(json.remaining_p0_gaps, []);
  assert.equal(json.ok, true);
  assert.equal(json.source_intelligence_1_18.status, 'present');
  assert.equal(json.agent_terminal_tmux_1_18.status, 'present');
  assert.equal(json.dynamic_agent_pool_1_18_3.status, 'present');
  assert.equal(json.dynamic_agent_pool_1_18.status, 'present');
  assert.equal(json.goal_mode_1_18.status, 'present');
  assert.equal(json.release_full_coverage_1_18.status, 'present');
});
