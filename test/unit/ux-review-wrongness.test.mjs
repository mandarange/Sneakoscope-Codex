import test from 'node:test';
import assert from 'node:assert/strict';
import { createWrongnessRecord, WRONGNESS_KINDS } from '../../dist/core/triwiki-wrongness/wrongness-schema.js';

test('UX-Review wrongness kinds are high-severity avoidance rules', () => {
  assert.ok(WRONGNESS_KINDS.includes('ux_review_text_only_fallback'));
  assert.ok(WRONGNESS_KINDS.includes('gpt_image_2_callout_generation_failed'));
  const record = createWrongnessRecord({ kind: 'visual_fix_not_rechecked', claim: 'fixed without recapture' });
  assert.equal(record.severity, 'high');
  assert.match(record.avoidance_rule.text, /recapture/);
});
