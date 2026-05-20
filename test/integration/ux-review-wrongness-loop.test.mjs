import test from 'node:test';
import assert from 'node:assert/strict';
import { createWrongnessRecord } from '../../dist/core/triwiki-wrongness/wrongness-schema.js';

test('UX-Review wrongness loop records text-only fallback as high severity', () => {
  const record = createWrongnessRecord({ kind: 'ux_review_text_only_fallback', claim: 'text critique passed as review' });
  assert.equal(record.severity, 'high');
  assert.match(record.avoidance_rule.text, /generated gpt-image-2 callout image/);
});
