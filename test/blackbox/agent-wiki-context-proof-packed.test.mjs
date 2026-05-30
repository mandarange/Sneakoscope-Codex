import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed agent wiki-context-proof gate passes', () => {
  const r = spawnSync(process.execPath, ['scripts/agent-wiki-context-proof-check.mjs'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
