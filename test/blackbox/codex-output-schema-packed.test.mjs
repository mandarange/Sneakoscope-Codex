import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('output-schema fixture passes from packaged dist imports', () => {
  const result = spawnSync(process.execPath, ['scripts/codex-output-schema-fixture-check.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).ok, true);
});
