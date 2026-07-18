import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildSsotGuard, validateSsotGuardArtifact } from '../../dist/core/safety/ssot-guard.js';

test('architecture guard carries authoritative-source expectations', () => {
  const guard = buildSsotGuard({ route: 'Naruto', mode: 'NARUTO', task: 'fixture' });
  assert.equal(guard.ok, true);
  assert.equal(guard.required, true);
  assert.ok(guard.canonical_sources.length > 0);
  assert.equal('solid_principles' in guard, false);
  assert.equal(validateSsotGuardArtifact(guard).ok, true);
});

test('architecture:guard script verifies pipeline and release wiring', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/architecture-guard-check.js'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.deepEqual(report.guarantees, ['ssot', 'merge-base', 'shrink-only']);
});
