import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('UX-Review text-only fallback check blocks prose-only review', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/ux-review-no-text-fallback-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.ok(json.blockers.includes('ux_review_text_only_fallback'));
});
