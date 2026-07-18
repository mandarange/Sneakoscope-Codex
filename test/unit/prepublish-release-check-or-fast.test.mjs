import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createReleaseStampProof } from '../helpers/release-stamp-proof.mjs';

const root = process.cwd();

test('prepublish wrapper fails closed on a stale stamp without running a release check', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-prepublish-stamp-'));
  const stampPath = path.join(dir, 'release-check-stamp.json');
  const markerPath = path.join(dir, 'unexpected-release-check.txt');
  await fs.writeFile(stampPath, `${JSON.stringify({
    schema: 'sks.release-check-stamp.v2',
    package_name: 'sneakoscope',
    package_version: '0.0.0',
    package_json_sha256: 'stale'
  }, null, 2)}\n`);

  const result = spawnSync(process.execPath, ['./dist/scripts/prepublish-release-check-or-fast.js'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      SKS_RELEASE_STAMP_PATH: stampPath,
      SKS_PREPUBLISH_RELEASE_CHECK_CMD: `${JSON.stringify(process.execPath)} -e "require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, 'ran')"`
    }
  });

  assert.notEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /requires a current authoritative full-release stamp/);
  assert.match(result.stderr, /Run `npm run release:check:full` separately/);
  const stamp = JSON.parse(await fs.readFile(stampPath, 'utf8'));
  assert.equal(stamp.package_version, '0.0.0');
  await assert.rejects(fs.access(markerPath));
});

test('prepublish wrapper fails closed when authoritative verification finds drift after the cheap check', async () => {
  const proof = createReleaseStampProof();
  const stampPath = proof.stampPath;
  const write = spawnSync(process.execPath, ['./dist/scripts/release-check-stamp.js', ...proof.writeArgs], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...proof.env }
  });
  assert.equal(write.status, 0, write.stderr || write.stdout);

  const stamp = JSON.parse(await fs.readFile(stampPath, 'utf8'));
  stamp.package_files_sha256 = 'stale';
  await fs.writeFile(stampPath, `${JSON.stringify(stamp, null, 2)}\n`);

  const result = spawnSync(process.execPath, ['./dist/scripts/prepublish-release-check-or-fast.js'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...proof.env
    }
  });

  assert.notEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /"ok":true/);
  assert.match(result.stderr, /Release check stamp failed: release:check stamp is stale/);
  assert.match(result.stderr, /requires a current authoritative full-release stamp/);
  assert.match(result.stderr, /Run `npm run release:check:full` separately/);

  const unchanged = JSON.parse(await fs.readFile(stampPath, 'utf8'));
  assert.equal(unchanged.package_files_sha256, 'stale');
  proof.cleanup();
});
