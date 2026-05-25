import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCodexWebSearchCapability, runCodexWebSearch } from '../../dist/core/codex/codex-web-search-adapter.js';

test('detects Codex Web Search capability and normalizes injected results', async () => {
  assert.equal(detectCodexWebSearchCapability({ env: { SKS_CODEX_WEB_SEARCH_AVAILABLE: '1' } }).available, true);
  assert.equal(detectCodexWebSearchCapability({ offline: true }).status, 'disabled_offline');
  const evidence = await runCodexWebSearch('query', {
    env: { SKS_CODEX_WEB_SEARCH_AVAILABLE: '1' },
    search: async () => [{ title: 'Example', url: 'https://example.com', snippet: 'ok' }]
  });
  assert.equal(evidence.ok, true);
  assert.equal(evidence.normalized_results[0].provider, 'codex_web');
});
