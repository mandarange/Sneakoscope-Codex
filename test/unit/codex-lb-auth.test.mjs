import test from 'node:test';
import assert from 'node:assert/strict';
import { codexLbMetrics } from '../../src/core/codex-lb-circuit.mjs';

test('codex-lb circuit opens on auth failure evidence', () => {
  const metrics = codexLbMetrics({
    schema: 'sks.codex-lb-circuit.v1',
    state: 'open',
    recent_failures: [{ kind: 'auth', redacted_error: '[redacted]' }],
    latency_ms: { p50: 1, p95: 1 }
  });
  assert.equal(metrics.ok, false);
  assert.equal(metrics.policy.auth_rejected, 'hard_failure');
});
