import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// This gate may legitimately exit 1 when no release stamp exists, so both exit 0
// (fast path eligible) and exit 1 (not eligible / no stamp) are acceptable. The
// contract under test is that it always RUNS and emits valid JSON with a boolean
// `ok` field — never throws.
test('prepublish fast-check runs and emits valid JSON with a boolean ok', () => {
  const r = spawnSync(process.execPath, ['scripts/prepublish-fast-check.mjs'], { encoding: 'utf8' });
  assert.ok(r.status === 0 || r.status === 1, `unexpected exit ${r.status}: ${r.stderr || r.stdout}`);
  const j = JSON.parse(r.stdout);
  assert.equal(typeof j.ok, 'boolean');
});
