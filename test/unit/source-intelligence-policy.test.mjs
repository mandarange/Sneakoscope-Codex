import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceIntelligencePolicy } from '../../dist/core/source-intelligence/source-intelligence-policy.js';

test('selects Super-Search v2 default, X-search, degraded, and blocked source intelligence modes', () => {
  const base = buildSourceIntelligencePolicy({
    query: 'current release notes',
    context7Available: true,
    codexWebCapability: { available: true, status: 'available', reason: 'fixture' }
  });
  assert.equal(base.mode, 'super_balanced');

  const xSearch = buildSourceIntelligencePolicy({
    query: 'site:x.com product launch',
    context7Available: true,
    codexWebCapability: { available: true, status: 'available', reason: 'fixture' },
    xaiDetection: { configured: true, search_capable: true, configured_but_unverified: false, status: 'search_capable' }
  });
  assert.equal(xSearch.mode, 'x_search');
  assert.ok(xSearch.selected_providers.includes('x_public'));
  assert.equal(Object.hasOwn(xSearch, ['xai', 'mcp'].join('_')), false);

  const degraded = buildSourceIntelligencePolicy({
    query: 'current release notes',
    context7Available: true,
    codexWebCapability: { available: false, status: 'unavailable', reason: 'fixture' }
  });
  assert.equal(degraded.mode, 'super_balanced');

  const blocked = buildSourceIntelligencePolicy({ query: 'npm package docs', context7Available: false });
  assert.equal(blocked.mode, 'blocked');
  assert.ok(blocked.blockers.includes('docs_context_missing'));
});
