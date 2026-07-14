import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { runSuperSearch } from '../super-search/index.js';
import { ensureProviderCapabilities } from '../provider/provider-self-heal.js';

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
  assert.equal(result.provider_self_heal?.attempted, true);
  assert.equal(result.provider_self_heal?.recovered, false);
  assert.equal(result.provider_self_heal?.manual_required, true);
  const reportPath = result.provider_self_heal?.report_paths[0];
  assert.ok(reportPath);
  const report = JSON.parse(await fsp.readFile(reportPath, 'utf8'));
  assert.equal(report.schema, 'sks.provider-self-heal.v1');
  assert.equal(report.capability, 'super_search_codex_web');
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
  globalThis.fetch = (async () => new Response(
    'Official project documentation provides verified release, installation, configuration, and security guidance for current users.',
    {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    },
  )) as typeof fetch;
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

test('provider self-heal writes common reports for image, browser, and computer providers', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-provider-self-heal-'));
  const reports = await ensureProviderCapabilities({
    root,
    capabilities: ['image_generation', 'browser_use', 'computer_use'],
    apply: true,
    fixture: 'manual-required',
  });

  assert.equal(reports.length, 3);
  assert.deepEqual(reports.map((report) => report.schema), [
    'sks.provider-self-heal.v1',
    'sks.provider-self-heal.v1',
    'sks.provider-self-heal.v1',
  ]);
  assert.deepEqual(reports.map((report) => report.capability), ['image_generation', 'browser_use', 'computer_use']);
  assert.ok(reports.every((report) => typeof report.attempted === 'boolean'));
  assert.ok(reports.every((report) => typeof report.recovered === 'boolean'));
  assert.ok(reports.every((report) => Array.isArray(report.manual_actions)));
  assert.ok(reports.some((report) => report.manual_required));
  for (const report of reports) await fsp.access(report.report_path);
});
