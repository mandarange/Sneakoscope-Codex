import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// This gate may legitimately exit 1 when no release stamp exists, so both exit 0
// (fast path eligible) and exit 1 (not eligible / no stamp) are acceptable. The
// contract under test is that it always RUNS and emits valid JSON with a boolean
// `ok` field — never throws.
test('prepublish fast-check runs and emits valid JSON with a boolean ok', () => {
  const r = spawnSync(process.execPath, ['dist/scripts/prepublish-fast-check.js'], { encoding: 'utf8' });
  assert.ok(r.status === 0 || r.status === 1, `unexpected exit ${r.status}: ${r.stderr || r.stdout}`);
  const j = JSON.parse(r.stdout);
  assert.equal(typeof j.ok, 'boolean');
});

test('prepublish fast-check does not fail solely on git commit drift', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-prepublish-fast-check-'));
  const stampPath = path.join(dir, 'release-check-stamp.json');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  fs.writeFileSync(
    stampPath,
    `${JSON.stringify({
      schema: 'sks.release-check-stamp.v1',
      package_name: pkg.name,
      package_version: pkg.version,
      git_commit: 'stale-but-content-equivalent'
    })}\n`
  );

  const r = spawnSync(process.execPath, ['dist/scripts/prepublish-fast-check.js'], {
    encoding: 'utf8',
    env: { ...process.env, SKS_RELEASE_STAMP_PATH: stampPath }
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, true);
  assert.equal(j.git_commit_changed_since_stamp, true);
  assert.deepEqual(j.mismatched, []);
});
