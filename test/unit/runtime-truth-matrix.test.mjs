import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('runtime truth matrix gate writes P0-P6 subsystem proof levels', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  const result = spawnSync(process.execPath, ['dist/scripts/release-runtime-truth-matrix-check.js'], { cwd: path.resolve('.'), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(fs.readFileSync(path.resolve(`.sneakoscope/reports/runtime-truth-matrix-${pkg.version}.json`), 'utf8'));
  assert.equal(report.ok, true);
  assert.equal(report.schema, 'sks.runtime-truth-matrix.v1');
  assert.equal(report.release_version, pkg.version);
  for (const subsystem of ['zellij_pane', 'codex_dynamic', 'cleanup', 'intelligent_work_graph', 'source_intelligence', 'goal_mode', 'route_blackbox', 'dynamic_scheduler', 'warp_mad_lanes', 'codex_0_134', 'mcp_0_134', 'parallel_write', 'patch_proof']) {
    const row = report.rows.find((item) => item.subsystem === subsystem);
    assert.ok(row, `missing subsystem ${subsystem}`);
    assert.equal(typeof row.proof_level, 'string');
    assert.equal(Array.isArray(row.evidence_artifacts), true);
    assert.equal(typeof row.next_action, 'string');
  }
  for (const priority of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6']) assert.equal(report.priorities[priority].status, 'closed');
});
