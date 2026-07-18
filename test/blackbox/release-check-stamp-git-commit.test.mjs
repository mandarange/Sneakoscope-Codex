import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createReleaseStampProof } from '../helpers/release-stamp-proof.mjs';

test('release-check-stamp verify rejects a stamp from another git commit', () => {
  const proof = createReleaseStampProof();
  const stampPath = proof.stampPath;
  const env = { ...process.env, ...proof.env };

  const write = spawnSync(process.execPath, ['dist/scripts/release-check-stamp.js', ...proof.writeArgs], { encoding: 'utf8', env });
  assert.equal(write.status, 0, write.stderr || write.stdout);

  const stamp = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
  stamp.git_commit = 'stale-but-content-equivalent';
  fs.writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`);

  const verify = spawnSync(process.execPath, ['dist/scripts/release-check-stamp.js', 'verify'], { encoding: 'utf8', env });
  assert.equal(verify.status, 2, verify.stderr || verify.stdout);
  assert.match(verify.stderr, /git_commit/);
  proof.cleanup();
});
