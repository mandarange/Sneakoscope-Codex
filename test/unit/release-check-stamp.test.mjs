import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createReleaseStampProof } from '../helpers/release-stamp-proof.mjs';

const pkg = JSON.parse(fsSync.readFileSync('package.json', 'utf8'));

test('affected or synthetic checks cannot write a publish-authorizing stamp', () => {
  const tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), 'sks-release-stamp-reject-'));
  const stamp = path.join(tmp, 'stamp.json');
  const write = spawnSync(process.execPath, ['dist/scripts/release-check-stamp.js', 'write'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, SKS_RELEASE_STAMP_PATH: stamp }
  });
  assert.equal(write.status, 2);
  assert.match(write.stderr, /full release proof required/);
  assert.equal(fsSync.existsSync(stamp), false);
});

test('release-check stamp can be written and verified without rerunning release:check', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-release-stamp-'));
  const stamp = path.join(tmp, 'stamp.json');
  const env = { ...process.env, SKS_RELEASE_STAMP_PATH: stamp };
  const proof = createReleaseStampProof();

  const write = spawnSync(process.execPath, ['dist/scripts/release-check-stamp.js', ...proof.writeArgs], {
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
  assert.equal(parsed.schema, 'sks.release-check-stamp.v2');
  assert.equal(parsed.package_name, 'sneakoscope');
  assert.equal(parsed.package_version, pkg.version);
  assert.match(parsed.source_digest, /^[a-f0-9]{64}$/);
  assert.equal(parsed.release_gate_proof.full, true);
  proof.cleanup();
});

test('release-check stamp ensure refreshes a stale publish stamp', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-release-stamp-ensure-'));
  const stamp = path.join(tmp, 'stamp.json');
  await fs.writeFile(stamp, '{"schema":"stale","package_version":"0.0.0"}\n');
  const proof = createReleaseStampProof();
  const env = {
    ...process.env,
    SKS_RELEASE_STAMP_PATH: stamp,
    SKS_RELEASE_CHECK_REFRESH_COMMAND: proof.writeCommand
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
  assert.equal(parsed.schema, 'sks.release-check-stamp.v2');
  assert.equal(parsed.package_version, pkg.version);
  proof.cleanup();
});

test('release-check stamp ignores dist root json files excluded from npm package files', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-release-stamp-dist-json-'));
  const stamp = path.join(tmp, 'stamp.json');
  const volatileDistJson = path.join(process.cwd(), 'dist', '__release-check-stamp-volatile-test.json');
  const env = { ...process.env, SKS_RELEASE_STAMP_PATH: stamp };
  const proof = createReleaseStampProof();

  await fs.writeFile(volatileDistJson, '{"attempt":1}\n');
  try {
    const write = spawnSync(process.execPath, ['dist/scripts/release-check-stamp.js', ...proof.writeArgs], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env
    });
    assert.equal(write.status, 0, write.stderr);

    await fs.writeFile(volatileDistJson, '{"attempt":2}\n');
    const verify = spawnSync(process.execPath, ['dist/scripts/release-check-stamp.js', 'verify'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env
    });
    assert.equal(verify.status, 0, verify.stderr);
    assert.match(verify.stdout, /Release check stamp verified/);
  } finally {
    await fs.rm(volatileDistJson, { force: true });
    proof.cleanup();
  }
});
