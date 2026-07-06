import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { runSuperSearch } from '../super-search/index.js';

test('source acquisition without a real provider cannot become a production success', async () => {
  const missionDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-no-provider-search-'));
  const result = await runSuperSearch({
    missionDir,
    query: 'current package release notes',
    mode: 'fast',
    env: {
      ...process.env,
      SKS_CODEX_WEB_SEARCH_AVAILABLE: '0',
      CODEX_WEB_SEARCH_AVAILABLE: '0',
    },
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('source_acquisition_unavailable'));
  assert.equal(result.proof.verified_source_count, 0);
  assert.ok(result.claims.every((claim) => claim.status !== 'supported'));
});

test('URL acquisition blocks instead of substituting an example URL', async () => {
  const missionDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-missing-url-search-'));
  const result = await runSuperSearch({
    missionDir,
    query: 'fetch',
    mode: 'url_acquisition',
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('missing_url_for_super_search_fetch'));
  assert.ok(result.sources.every((source) => source.canonical_url !== 'https://example.com/'));
});

test('URL acquisition writes verified content evidence when direct fetch succeeds', async () => {
  const missionDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-url-fetch-search-'));
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('official source body', {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  })) as typeof fetch;
  try {
    const result = await runSuperSearch({
      missionDir,
      query: 'https://github.com/mandarange/Sneakoscope-Codex',
      mode: 'url_acquisition',
    });

    assert.equal(result.ok, true);
    assert.equal(result.proof.verified_source_count, 1);
    assert.equal(result.sources[0]?.acquisition_verdict, 'verified_content');
    assert.ok(result.sources[0]?.content_artifact);
    await fsp.access(path.join(missionDir, 'super-search', result.sources[0]!.content_artifact!));
  } finally {
    globalThis.fetch = previousFetch;
  }
});
