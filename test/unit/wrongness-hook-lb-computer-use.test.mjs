import test from 'node:test';
import assert from 'node:assert/strict';
import { createWrongnessRecord } from '../../dist/core/triwiki-wrongness/wrongness-schema.js';

test('wrongness schema accepts hook, codex-lb, and Computer Use regression kinds', () => {
  for (const kind of ['hook_semantic_mismatch', 'codex_lb_missing_env_raw_message', 'computer_use_policy_misclassification']) {
    const record = createWrongnessRecord({
      wrongness_kind: kind,
      claim: { text: `${kind} fixture` },
      root_cause: { category: 'route_policy_gap', explanation: 'fixture' }
    });
    assert.equal(record.wrongness_kind, kind);
    assert.equal(record.severity, 'high');
    assert.ok(record.avoidance_rule.text);
  }
});
