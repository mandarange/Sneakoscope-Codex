import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('release-check-stamp verify treats git_commit as provenance only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-release-check-stamp-'));
  const stampPath = path.join(dir, 'release-check-stamp.json');
  const env = { ...process.env, SKS_RELEASE_STAMP_PATH: stampPath };

  const write = spawnSync(process.execPath, ['scripts/release-check-stamp.mjs', 'write'], { encoding: 'utf8', env });
  assert.equal(write.status, 0, write.stderr || write.stdout);

  const stamp = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
  stamp.git_commit = 'stale-but-content-equivalent';
  fs.writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`);

  const verify = spawnSync(process.execPath, ['scripts/release-check-stamp.mjs', 'verify'], { encoding: 'utf8', env });
  assert.equal(verify.status, 0, verify.stderr || verify.stdout);
});
