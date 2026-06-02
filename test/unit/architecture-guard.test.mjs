import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildSsotGuard, validateSsotGuardArtifact } from '../../dist/core/safety/ssot-guard.js';

test('architecture guard carries SSOT and SOLID expectations', () => {
  const guard = buildSsotGuard({ route: 'Team', mode: 'TEAM', task: 'fixture' });
  assert.equal(guard.ok, true);
  assert.equal(guard.required, true);
  assert.equal(guard.solid_principles.length, 5);
  assert.equal(validateSsotGuardArtifact(guard).ok, true);
});

test('architecture:guard script verifies pipeline and release wiring', () => {
  const result = spawnSync(process.execPath, ['scripts/architecture-guard-check.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.deepEqual(report.guarantees, ['ssot', 'solid']);
});
