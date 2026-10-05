import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Regression checks that ship as standalone scripts and are not part of the release
// gate DAG. Nothing else runs them, and two had already drifted out of sync with the
// code they guard before anyone noticed; running them here keeps them honest.
const CHECKS = [
  'blackbox-command-import-smoke',
  'codex-project-config-policy-merge-regression',
  'doctor-fix-recovers-corrupted-config-check',
  'install-update-preserves-config-check',
  'mad-sks-immutable-harness-check',
  'mad-sks-sql-plane-safety-conflict-matrix-check',
  'mcp-tool-policy-check',
  'project-skill-dedupe-check',
  'provider-context-config-toml-check',
  'retention-cleanup-safety-check',
  'retention-long-run-smoke-check',
  'skill-sync-atomic-check'
];

for (const name of CHECKS) {
  test(`${name} stays green`, () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-standalone-check-'));
    try {
      // These run as plain scripts, not inside a node:test child, so drop the runner's marker.
      const scratch = path.join(home, 'tmp');
      fs.mkdirSync(scratch);
      const env = { ...process.env, HOME: home, TMPDIR: scratch, CODEX_HOME: path.join(home, '.codex'), SKS_GLOBAL_ROOT: path.join(home, 'global'), SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' };
      delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, [path.join(process.cwd(), 'dist', 'scripts', `${name}.js`)], {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 170_000,
        maxBuffer: 16 * 1024 * 1024,
        env
      });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`.slice(-1500));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
}
