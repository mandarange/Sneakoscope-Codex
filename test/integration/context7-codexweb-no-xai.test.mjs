import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceIntelligencePolicy } from '../../dist/core/source-intelligence/source-intelligence-policy.js';

test('xAI missing uses Super-Search balanced mode', () => {
  const policy = buildSourceIntelligencePolicy({
    context7Available: true,
    codexWebCapability: { available: true, status: 'available', reason: 'fixture' },
    xaiDetection: { configured: false, search_capable: false, configured_but_unverified: false, status: 'missing' }
  });
  assert.equal(policy.ok, true);
  assert.equal(policy.mode, 'super_balanced');
  assert.equal(Object.hasOwn(policy, ['xai', 'mcp'].join('_')), false);
});
