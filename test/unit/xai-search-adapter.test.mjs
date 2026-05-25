import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeXaiSearchResults, redactXaiRawResponse, runXaiSearch } from '../../dist/core/mcp/xai-search-adapter.js';

test('normalizes, redacts, and blocks unavailable X AI search adapter', async () => {
  const raw = { results: [{ title: 'X', url: 'https://x.ai', snippet: 'search result' }] };
  assert.equal(normalizeXaiSearchResults(raw)[0].provider, 'xai');
  assert.equal(redactXaiRawResponse(raw).result_count, 1);

  const missing = await runXaiSearch('query', { configured: false });
  assert.equal(missing.ok, false);
  assert.ok(missing.blockers.includes('xai_mcp_missing'));
});
