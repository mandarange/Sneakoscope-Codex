import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('dist CLI reports Codex 0.133 compatibility matrix', () => {
  const result = spawnSync(process.execPath, ['dist/bin/sks.js', 'codex', 'compatibility', '--json'], { encoding: 'utf8', env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1' } });
  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.required_baseline, 'rust-v0.133.0');
  assert.equal(json.codex_0_133.baseline, 'rust-v0.133.0');
  assert.equal(typeof json.codex_0_133.goals_enabled_by_default, 'boolean');
  assert.equal(json.hooks_schema.snapshot, 'latest');
});
