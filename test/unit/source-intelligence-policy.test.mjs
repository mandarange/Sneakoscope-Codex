import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceIntelligencePolicy } from '../../dist/core/source-intelligence/source-intelligence-policy.js';

test('selects default, X AI, degraded, and blocked source intelligence modes', () => {
  const base = buildSourceIntelligencePolicy({
    context7Available: true,
    codexWebCapability: { available: true, status: 'available', reason: 'fixture' },
    xaiDetection: { configured: false, search_capable: false, configured_but_unverified: false, status: 'missing' }
  });
  assert.equal(base.mode, 'context7_codex_web');

  const xai = buildSourceIntelligencePolicy({
    context7Available: true,
    codexWebCapability: { available: true, status: 'available', reason: 'fixture' },
    xaiDetection: { configured: true, search_capable: true, configured_but_unverified: false, status: 'search_capable' }
  });
  assert.equal(xai.mode, 'context7_codex_web_xai');
  assert.equal(xai.xai_mcp.required, true);

  const degraded = buildSourceIntelligencePolicy({
    context7Available: true,
    codexWebCapability: { available: false, status: 'unavailable', reason: 'fixture' }
  });
  assert.equal(degraded.mode, 'context7_only_degraded');

  const blocked = buildSourceIntelligencePolicy({ context7Available: false });
  assert.equal(blocked.mode, 'blocked');
  assert.ok(blocked.blockers.includes('docs_context_missing'));
});
