import test from 'node:test';
import assert from 'node:assert/strict';
import { createWrongnessRecord } from '../../dist/core/triwiki-wrongness/wrongness-schema.js';

test('setup choice drift wrongness records carry the new avoidance rule', () => {
  const record = createWrongnessRecord({
    wrongness_kind: 'codex_lb_setup_choice_drift',
    claim: { text: 'setup answer was ignored' }
  });
  assert.match(record.avoidance_rule.text, /answers are ignored/);
});
