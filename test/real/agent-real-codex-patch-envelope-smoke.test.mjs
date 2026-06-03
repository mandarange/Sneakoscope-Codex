import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

test('real Codex patch envelope smoke is integration_optional unless explicitly requested', () => {
  const env = { ...process.env };
  delete env.SKS_TEST_REAL_CODEX_PATCHES;
  delete env.SKS_REQUIRE_REAL_CODEX_PATCHES;
  const run = spawnSync(process.execPath, ['dist/scripts/agent-real-codex-patch-envelope-smoke.js'], {
    encoding: 'utf8',
    env,
    timeout: 60_000
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const report = JSON.parse(fs.readFileSync('.sneakoscope/reports/agent-real-codex-patch-envelope-smoke.json', 'utf8'));
  assert.equal(report.status, 'integration_optional');
  assert.equal(report.proof_level, 'integration_optional');
});
