import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('release-check stamp can be written and verified without rerunning release:check', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-release-stamp-'));
  const stamp = path.join(tmp, 'stamp.json');
  const env = { ...process.env, SKS_RELEASE_STAMP_PATH: stamp };

  const write = spawnSync(process.execPath, ['scripts/release-check-stamp.mjs', 'write'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env
  });
  assert.equal(write.status, 0, write.stderr);
  assert.match(write.stdout, /Release check stamp written/);

  const verify = spawnSync(process.execPath, ['scripts/release-check-stamp.mjs', 'verify'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env
  });
  assert.equal(verify.status, 0, verify.stderr);
  assert.match(verify.stdout, /Release check stamp verified/);

  const parsed = JSON.parse(await fs.readFile(stamp, 'utf8'));
  assert.equal(parsed.schema, 'sks.release-check-stamp.v1');
  assert.equal(parsed.package_name, 'sneakoscope');
  assert.equal(parsed.package_version, '1.0.3');
  assert.match(parsed.source_digest, /^[a-f0-9]{64}$/);
});
