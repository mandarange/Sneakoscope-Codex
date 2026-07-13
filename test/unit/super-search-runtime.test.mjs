import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runSuperSearch } from '../../dist/core/super-search/index.js';

test('materializes Context7 content and does not split one npm owner into fake independence', async () => {
  const missionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-super-search-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(`Verified official documentation content for ${url}. This response contains enough meaningful source text to support a bounded evidence check without relying on a search snippet alone.`, { status: 200, headers: { 'content-type': 'text/plain' } });
  try {
    const result = await runSuperSearch({
      missionDir,
      query: 'npm package docs',
      context7: async () => [{
        title: 'npm docs',
        url: 'https://docs.npmjs.com',
        snippet: 'official docs',
        content: 'Verified Context7 documentation content for npm package behavior. This materialized source contains enough meaningful text to support a bounded evidence check instead of relying on a title or search snippet alone.'
      }],
      codexWebSearch: async () => [{ title: 'npm registry', url: 'https://www.npmjs.com/package/npm', snippet: 'registry result' }],
      env: { SKS_CODEX_WEB_SEARCH_AVAILABLE: '1' }
    });
    assert.equal(result.proof.provider_independent, false);
    assert.deepEqual(result.proof.verified_provider_families.sort(), ['official_docs', 'web']);
    assert.equal(result.proof.verified_provider_family_count, 2);
    assert.deepEqual(result.proof.verified_independence_clusters, ['npmjs.com']);
    assert.equal(result.proof.verified_independence_cluster_count, 1);
    assert.equal(result.proof.xai_runtime_dependency, false);
    assert.equal(result.proof.ok, true);
    assert.ok(result.query_execution.completed >= 2);
    assert.ok(result.sources.some((source) => source.acquisition_verdict === 'verified_content'));
    const context7Source = result.sources.find((source) => source.provider_id === 'context7');
    assert.ok(context7Source?.content_artifact);
    assert.match(context7Source?.content_sha256 || '', /^[a-f0-9]{64}$/);
    assert.equal(result.sources.filter((source) => source.canonical_url === 'https://www.npmjs.com/package/npm').length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Context7 title or snippet alone cannot synthesize verified evidence', async () => {
  const missionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-super-search-context7-snippet-'));
  const result = await runSuperSearch({
    missionDir,
    query: 'npm package docs',
    context7: async () => [{ title: 'npm docs', url: 'https://docs.npmjs.com', snippet: 'short discovery snippet' }],
    env: { SKS_CODEX_WEB_SEARCH_AVAILABLE: '0' }
  });
  const source = result.sources.find((row) => row.provider_id === 'context7');
  assert.equal(source?.acquisition_verdict, 'weak_content');
  assert.equal(source?.content_artifact, null);
  assert.equal(source?.content_sha256, null);
  assert.ok(source?.blockers.includes('context7_content_artifact_missing'));
  assert.equal(result.proof.verified_source_count, 0);
  assert.equal(result.proof.ok, false);
});

test('reports provider independence truthfully for a single verified acquisition provider', async () => {
  const missionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-super-search-single-provider-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(`Independent verification content for ${url}. This article contains a meaningful body with enough words to be treated as hydrated evidence by the source verifier.`, { status: 200, headers: { 'content-type': 'text/plain' } });
  try {
    const result = await runSuperSearch({
      missionDir,
      query: 'current product capability',
      codexWebSearch: async () => [{ title: 'Capability report', url: 'https://example.com/report', snippet: 'discovery result' }],
      env: { SKS_CODEX_WEB_SEARCH_AVAILABLE: '1' }
    });
    assert.equal(result.proof.ok, true);
    assert.equal(result.proof.provider_independent, false);
    assert.equal(result.proof.verified_provider_count, 1);
    assert.deepEqual(result.proof.verified_provider_ids, ['direct_url']);
    assert.deepEqual(result.proof.verified_provider_families, ['web']);
    assert.deepEqual(result.proof.verified_independence_clusters, ['example.com']);
    const gate = JSON.parse(await fs.readFile(path.join(missionDir, 'super-search', 'super-search-gate.json'), 'utf8'));
    assert.equal(gate.replacement_state, 'usable_verified_runtime');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not treat multiple adapter IDs in one provider family as provider-independent', async () => {
  const missionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-super-search-one-family-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(`Verified evidence for ${url}. This response contains enough meaningful text to pass the bounded hydration policy for a source record.`, { status: 200, headers: { 'content-type': 'text/plain' } });
  try {
    const result = await runSuperSearch({
      missionDir,
      query: 'comparative research current capability',
      codexWebSearch: async () => [
        { title: 'Evidence A', url: 'https://alpha.example.com/report', snippet: 'discovery result A' },
        { title: 'Evidence B', url: 'https://beta.example.net/report', snippet: 'discovery result B' }
      ],
      maxHydratedSources: 2,
      env: { SKS_CODEX_WEB_SEARCH_AVAILABLE: '1' }
    });
    assert.equal(result.proof.ok, true);
    assert.equal(result.proof.verified_independence_cluster_count, 2);
    assert.deepEqual(result.proof.verified_provider_families, ['web']);
    assert.equal(result.proof.provider_independent, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('missing HTTP Content-Type blocks hydrated content verification', async () => {
  const missionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-super-search-content-type-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new TextEncoder().encode('A meaningful text body with enough words to look plausible but without a declared media type must remain unverified.'), { status: 200 });
  try {
    const result = await runSuperSearch({
      missionDir,
      query: 'current evidence content type',
      codexWebSearch: async () => [{ title: 'Missing type', url: 'https://example.com/missing-type', snippet: 'discovery only' }],
      env: { SKS_CODEX_WEB_SEARCH_AVAILABLE: '1' }
    });
    assert.equal(result.proof.ok, false);
    assert.ok(result.proof.blockers.includes('direct_url_fetch_content_type_missing'), JSON.stringify(result.proof));
    assert.equal(result.proof.verified_source_count, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects login, challenge, and soft-error HTML returned with HTTP 200', async () => {
  for (const [name, body, expected] of [
    ['login', '<html><title>Sign in</title><form class="login"><input type="password"></form><p>Sign in to continue to the requested article.</p></html>', 'direct_url_fetch_auth_or_challenge_content'],
    ['challenge', '<html><title>Attention Required</title><p>Checking your browser. Verify you are human before continuing through this Cloudflare challenge page.</p></html>', 'direct_url_fetch_auth_or_challenge_content'],
    ['soft404', '<html><title>404 Not Found</title><p>The page you requested was not found. This page does not exist, although the server returned HTTP 200.</p></html>', 'direct_url_fetch_error_or_soft_404_content']
  ]) {
    const missionDir = await fs.mkdtemp(path.join(os.tmpdir(), `sks-super-search-${name}-`));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
    try {
      const result = await runSuperSearch({
        missionDir,
        query: `current evidence ${name}`,
        codexWebSearch: async () => [{ title: 'Discovered page', url: `https://example.com/${name}`, snippet: 'search discovery only' }],
        env: { SKS_CODEX_WEB_SEARCH_AVAILABLE: '1' }
      });
      assert.equal(result.proof.ok, false);
      assert.ok(result.proof.blockers.includes(expected), JSON.stringify(result.proof));
      assert.equal(result.proof.verified_source_count, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});

test('does not promote public X discovery-only results to parity', async () => {
  const missionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-super-search-x-'));
  const result = await runSuperSearch({
    missionDir,
    query: 'site:x.com product launch',
    mode: 'x_search',
    env: { SKS_CODEX_WEB_SEARCH_AVAILABLE: '0' }
  });
  assert.equal(result.proof.ok, false);
  assert.ok(result.proof.blockers.includes('x_search_parity_not_proven'));
  assert.equal(result.proof.xai_runtime_dependency, false);
});
