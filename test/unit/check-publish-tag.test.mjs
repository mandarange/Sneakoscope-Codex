import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function run(env = {}) {
  return spawnSync(process.execPath, ['dist/scripts/check-publish-tag.js'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

test('plain npm publish accepts the root backfill tag for 4.3.0', () => {
  const result = run({ npm_config_tag: '' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /-> backfill-4-3/);
});

test('stable release rejects rc publish tag', () => {
  const result = run({ npm_lifecycle_event: 'prepublishOnly', npm_config_tag: 'rc' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /must be published with the latest dist-tag/);
});
