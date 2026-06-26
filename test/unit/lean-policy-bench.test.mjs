import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('lean policy bench compares baseline and lean context without live claims', async () => {
  const { runLeanPolicyBench } = await import('../../dist/core/bench.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-lean-policy-bench-test-'));
  const report = await runLeanPolicyBench(root);
  assert.equal(report.schema, 'sks.lean-policy-bench.v1');
  assert.equal(report.ok, true);
  assert.match(report.method, /no live model accuracy/);
  assert.equal(report.metrics.scenario_count, 8);
  assert.equal(report.metrics.overbuild_caught_by_lean, 4);
  assert.equal(report.metrics.safety_rejected_by_both, 4);
  await fs.access(path.join(root, '.sneakoscope', 'reports', 'performance', 'lean-policy-bench.json'));
  await fs.access(path.join(root, '.sneakoscope', 'reports', 'performance', 'lean-policy-bench.md'));
});
