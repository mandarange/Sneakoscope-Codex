import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('UX-Review command fixture writes mock-safe artifacts', () => {
  const result = spawnSync(process.execPath, ['dist/bin/sks.js', 'image-ux-review', 'fixture', '--mock', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' },
    timeout: 60_000
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.artifacts.gate.mock_fixture_cannot_claim_real, true);
});
