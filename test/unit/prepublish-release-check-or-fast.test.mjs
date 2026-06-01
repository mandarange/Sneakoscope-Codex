import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();

test('prepublish wrapper repairs stale stamp by running the configured full release check command', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-prepublish-stamp-'));
  const stampPath = path.join(dir, 'release-check-stamp.json');
  await fs.writeFile(stampPath, `${JSON.stringify({
    schema: 'sks.release-check-stamp.v1',
    package_name: 'sneakoscope',
    package_version: '0.0.0',
    package_json_sha256: 'stale'
  }, null, 2)}\n`);

  const result = spawnSync(process.execPath, ['./scripts/prepublish-release-check-or-fast.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      SKS_RELEASE_STAMP_PATH: stampPath,
      SKS_PREPUBLISH_RELEASE_CHECK_CMD: `${process.execPath} ./scripts/release-check-stamp.mjs write`
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /running full `npm run release:check` before publish/);
  const stamp = JSON.parse(await fs.readFile(stampPath, 'utf8'));
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(stamp.package_version, pkg.version);
});
