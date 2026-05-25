import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceIntelligencePolicy } from '../../dist/core/source-intelligence/source-intelligence-policy.js';

test('X AI missing falls back to Context7 plus Codex Web mode', () => {
  const policy = buildSourceIntelligencePolicy({
    context7Available: true,
    codexWebCapability: { available: true, status: 'available', reason: 'fixture' },
    xaiDetection: { configured: false, search_capable: false, configured_but_unverified: false, status: 'missing' }
  });
  assert.equal(policy.ok, true);
  assert.equal(policy.mode, 'context7_codex_web');
});
