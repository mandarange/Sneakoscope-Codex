import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('non-recursive pipeline checker emits passing repo report shape', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/non-recursive-pipeline-check.js', '--json', '--no-write'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schema, 'sks.non-recursive-pipeline-report.v1');
  assert.equal(report.ok, true);
  assert.equal(report.local_only, true);
  assert.equal(report.proof.env_guard_configured, true);
  assert.equal(report.proof.command_denylist_enforced, true);
  assert.equal(report.proof.route_denylist_enforced, true);
  assert.equal(report.proof.stdout_transcript_scan, true);
  assert.equal(report.proof.stderr_transcript_scan, true);
  assert.equal(report.proof.agent_result_scan, true);
  assert.equal(report.trust_report.trust, 'high');
  assert.ok(report.evidence_router.records.length > 0);
});
