import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed codex-lb config TOML-safety gate passes', () => {
  const result = spawnSync(process.execPath, ['scripts/codex-lb-config-toml-safety-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
