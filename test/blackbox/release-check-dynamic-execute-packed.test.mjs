import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('dynamic execute --plan-only produces a v2 report with execute/cache fields and passing invariants', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/release-check-dynamic-execute.js', '--plan-only'], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.gate, 'release:check:dynamic:execute');
  assert.equal(json.mode, 'plan-only');
});

test('dynamic execute report has schema v2 with executed/skipped/cache_hits/failures', async () => {
  spawnSync(process.execPath, ['dist/scripts/release-check-dynamic-execute.js', '--plan-only'], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  const fs = await import('node:fs/promises');
  const report = JSON.parse(await fs.readFile('.sneakoscope/reports/release-check-dynamic-execute.json', 'utf8'));
  assert.equal(report.schema, 'sks.release-check-dynamic.v2');
  for (const k of ['mode', 'selected', 'skipped', 'executed', 'cache_hits', 'failures', 'ok', 'invariants']) {
    assert.ok(k in report, `report missing field: ${k}`);
  }
  assert.equal(report.invariants.docs_only_skips_heavy, true);
  assert.equal(report.invariants.publish_keeps_required, true);
  assert.equal(report.failures.length, 0);
  assert.ok(report.skipped.every((s) => typeof s.reason === 'string' && s.reason.length > 0));
});
