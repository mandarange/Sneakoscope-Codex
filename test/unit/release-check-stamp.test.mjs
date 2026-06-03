import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pkg = JSON.parse(fsSync.readFileSync('package.json', 'utf8'));

test('release-check stamp can be written and verified without rerunning release:check', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-release-stamp-'));
  const stamp = path.join(tmp, 'stamp.json');
  const env = { ...process.env, SKS_RELEASE_STAMP_PATH: stamp };

  const write = spawnSync(process.execPath, ['dist/scripts/release-check-stamp.js', 'write'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env
  });
  assert.equal(write.status, 0, write.stderr);
  assert.match(write.stdout, /Release check stamp written/);

  const verify = spawnSync(process.execPath, ['dist/scripts/release-check-stamp.js', 'verify'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env
  });
  assert.equal(verify.status, 0, verify.stderr);
  assert.match(verify.stdout, /Release check stamp verified/);

  const parsed = JSON.parse(await fs.readFile(stamp, 'utf8'));
  assert.equal(parsed.schema, 'sks.release-check-stamp.v1');
  assert.equal(parsed.package_name, 'sneakoscope');
  assert.equal(parsed.package_version, pkg.version);
  assert.match(parsed.source_digest, /^[a-f0-9]{64}$/);
});

test('release-check stamp ensure refreshes a stale publish stamp', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-release-stamp-ensure-'));
  const stamp = path.join(tmp, 'stamp.json');
  await fs.writeFile(stamp, '{"schema":"stale","package_version":"0.0.0"}\n');
  const env = {
    ...process.env,
    SKS_RELEASE_STAMP_PATH: stamp,
    SKS_RELEASE_CHECK_REFRESH_COMMAND: `${JSON.stringify(process.execPath)} ./dist/scripts/release-check-stamp.js write`
  };

  const ensure = spawnSync(process.execPath, ['dist/scripts/release-check-stamp.js', 'ensure'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env
  });
  assert.equal(ensure.status, 0, ensure.stderr);
  assert.match(ensure.stderr, /Release check stamp is not current/);
  assert.match(ensure.stdout, /Release check stamp verified/);

  const parsed = JSON.parse(await fs.readFile(stamp, 'utf8'));
  assert.equal(parsed.schema, 'sks.release-check-stamp.v1');
  assert.equal(parsed.package_version, pkg.version);
});
