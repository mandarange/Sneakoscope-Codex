import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceIntelligencePolicy } from '../../dist/core/source-intelligence/source-intelligence-policy.js';

test('source intelligence v2 ignores xAI detection as an authority signal', () => {
  const policy = buildSourceIntelligencePolicy({
    query: 'site:x.com product launch',
    context7Available: true,
    codexWebCapability: { available: true, status: 'available', reason: 'fixture' },
    xaiDetection: { configured: true, search_capable: true, status: 'search_capable' }
  });
  assert.equal(policy.mode, 'x_search');
  assert.ok(policy.selected_providers.includes('x_public'));
  assert.equal(Object.hasOwn(policy, ['xai', 'mcp'].join('_')), false);
});
