import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceIntelligencePolicy } from '../../dist/core/source-intelligence/source-intelligence-policy.js';
import { buildSourceIntelligenceProof } from '../../dist/core/source-intelligence/source-intelligence-proof.js';

test('source intelligence proof rejects missing Super-Search proof instead of requiring xAI', () => {
  const policy = buildSourceIntelligencePolicy({
    query: 'site:x.com product launch',
    context7Available: true,
    codexWebCapability: { available: true, status: 'available', reason: 'fixture' },
    xaiDetection: { configured: true, search_capable: true }
  });
  const proof = buildSourceIntelligenceProof(policy, { context7: { ok: true, status: 'not_required', blockers: [] } });
  assert.ok(proof.blockers.includes('super_search_provider_independent_proof_missing'));
  assert.equal(proof.source_intelligence.provider_independent, false);
});
