import test from 'node:test';
import assert from 'node:assert/strict';
import { detectXaiMcpFromConfig } from '../../dist/core/mcp/xai-mcp-detector.js';

test('detects search-capable X AI MCP config and treats missing config as ok fallback', () => {
  const detected = detectXaiMcpFromConfig([
    { path: 'config.toml', source: 'provided', text: '[mcp_servers.grok]\ntools = ["search", "news"]\n' }
  ]);
  assert.equal(detected.ok, true);
  assert.equal(detected.configured, true);
  assert.equal(detected.search_capable, true);
  assert.equal(detected.status, 'search_capable');

  const missing = detectXaiMcpFromConfig([]);
  assert.equal(missing.ok, true);
  assert.equal(missing.status, 'missing');
  assert.equal(missing.search_capable, false);
});
