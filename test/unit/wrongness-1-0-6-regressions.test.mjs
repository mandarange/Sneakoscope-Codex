import test from 'node:test';
import assert from 'node:assert/strict';
import { createWrongnessRecord } from '../../dist/core/triwiki-wrongness/wrongness-schema.js';

test('wrongness schema accepts 1.0.6 precision-polish regression kinds', () => {
  for (const kind of [
    'hook_strict_subset_misclassified',
    'codex_lb_setup_choice_drift',
    'codex_lb_env_persistence_failure',
    'computer_use_live_smoke_mismatch',
    'computer_use_external_block_overclaimed'
  ]) {
    const record = createWrongnessRecord({ wrongness_kind: kind, claim: { text: kind } });
    assert.equal(record.wrongness_kind, kind);
    assert.equal(record.severity, 'high');
  }
});
