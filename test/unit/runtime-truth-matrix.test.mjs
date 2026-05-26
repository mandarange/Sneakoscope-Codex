import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('runtime truth matrix gate writes P0-P5 subsystem proof levels', () => {
  const result = spawnSync(process.execPath, ['scripts/release-runtime-truth-matrix-check.mjs'], { cwd: path.resolve('.'), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(fs.readFileSync(path.resolve('.sneakoscope/reports/runtime-truth-matrix-1.18.5.json'), 'utf8'));
  assert.equal(report.ok, true);
  for (const priority of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']) assert.equal(report.priorities[priority].status, 'closed');
  assert.equal(report.regression_catalog_count, 150);
});
