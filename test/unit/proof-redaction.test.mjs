import test from 'node:test';
import assert from 'node:assert/strict';
import { assertProofRedaction } from '../../src/core/proof/proof-redaction.test-helper.mjs';

test('proof redaction normalizes secret markers', () => {
  const result = assertProofRedaction({
    token: 'sk-proj-12345678901234567890',
    nested: ['Bearer abcdefghijklmnop']
  });
  assert.equal(result.ok, true);
  assert.equal(result.redacted.token, '[redacted]');
});
