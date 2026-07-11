import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createReleaseStampProof } from '../helpers/release-stamp-proof.mjs';

const root = process.cwd();

test('prepublish wrapper repairs stale stamp by running the configured full release check command', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-prepublish-stamp-'));
  const stampPath = path.join(dir, 'release-check-stamp.json');
  const proof = createReleaseStampProof();
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
      SKS_PREPUBLISH_RELEASE_CHECK_CMD: proof.writeCommand
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /running full `npm run release:check:full` before publish/);
  const stamp = JSON.parse(await fs.readFile(stampPath, 'utf8'));
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(stamp.package_version, pkg.version);
  proof.cleanup();
});

test('prepublish wrapper repairs stamp drift that the cheap fast check cannot recompute', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-prepublish-authoritative-stamp-'));
  const stampPath = path.join(dir, 'release-check-stamp.json');
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const proof = createReleaseStampProof();
  await fs.writeFile(stampPath, `${JSON.stringify({
    schema: 'sks.release-check-stamp.v2',
    package_name: pkg.name,
    package_version: pkg.version,
    git_commit: 'stale-but-content-equivalent',
    package_files_sha256: 'stale',
    dist_build_sha256: 'stale',
    dist_file_count: 0,
    release_gate_sha256: 'stale',
    release_check_sha256: 'stale',
    source_digest: 'stale',
    source_file_count: 0
  }, null, 2)}\n`);

  const result = spawnSync(process.execPath, ['./dist/scripts/prepublish-release-check-or-fast.js'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      SKS_RELEASE_STAMP_PATH: stampPath,
      SKS_PREPUBLISH_RELEASE_CHECK_CMD: proof.writeCommand
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /"ok":true/);
  assert.match(result.stderr, /Release check stamp failed: release:check stamp is stale/);
  assert.match(result.stderr, /running full `npm run release:check:full` before publish/);

  const stamp = JSON.parse(await fs.readFile(stampPath, 'utf8'));
  assert.equal(stamp.package_version, pkg.version);
  assert.notEqual(stamp.source_digest, 'stale');
  assert.notEqual(stamp.dist_build_sha256, 'stale');
  proof.cleanup();
});
