import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('zellij doctor-readiness gate passes', () => {
  const result = spawnSync(process.execPath, ['scripts/zellij-doctor-readiness-check.mjs'], { encoding: 'utf8' });
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true, result.stdout + result.stderr);
  assert.equal(result.status, 0);
  assert.equal(json.gate, 'zellij:doctor-readiness');
  assert.equal(json.cli_ready_when_missing, true);
  assert.equal(json.mad_ready_when_missing, false);
  assert.ok(json.scrapeable_sections < json.lane_sections);
});
