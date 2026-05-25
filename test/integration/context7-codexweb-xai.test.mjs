import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceIntelligenceProof } from '../../dist/core/source-intelligence/source-intelligence-proof.js';
import { buildSourceIntelligencePolicy } from '../../dist/core/source-intelligence/source-intelligence-policy.js';

test('X AI available path requires X evidence for proof', () => {
  const policy = buildSourceIntelligencePolicy({
    context7Available: true,
    codexWebCapability: { available: true, status: 'available', reason: 'fixture' },
    xaiDetection: { configured: true, search_capable: true, configured_but_unverified: false, status: 'search_capable' }
  });
  const proof = buildSourceIntelligenceProof(policy, { context7: { ok: true, status: 'completed', blockers: [] }, codex_web_search: { ok: true }, xai_search: null });
  assert.equal(proof.ok, false);
  assert.ok(proof.blockers.includes('xai_available_not_used'));
});
