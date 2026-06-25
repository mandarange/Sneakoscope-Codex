import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runUltraSearch } from '../../dist/core/ultra-search/index.js';

test('runs provider-independent UltraSearch and records typed proof', async () => {
  const missionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-ultra-'));
  const result = await runUltraSearch({
    missionDir,
    query: 'npm package docs',
    context7: async () => [{ title: 'npm docs', url: 'https://docs.npmjs.com', snippet: 'official docs' }],
    codexWebSearch: async () => [{ title: 'npm registry', url: 'https://www.npmjs.com/package/npm', snippet: 'registry result' }],
    env: { SKS_CODEX_WEB_SEARCH_AVAILABLE: '1' }
  });
  assert.equal(result.proof.provider_independent, true);
  assert.equal(result.proof.xai_runtime_dependency, false);
  assert.equal(result.proof.ok, true);
  assert.ok(result.sources.some((source) => source.acquisition_verdict === 'verified_content'));
});

test('does not promote public X discovery-only results to parity', async () => {
  const missionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-ultra-x-'));
  const result = await runUltraSearch({
    missionDir,
    query: 'site:x.com product launch',
    mode: 'x_search',
    env: { SKS_CODEX_WEB_SEARCH_AVAILABLE: '0' }
  });
  assert.equal(result.proof.ok, false);
  assert.ok(result.proof.blockers.includes('x_search_parity_not_proven'));
  assert.equal(result.proof.xai_runtime_dependency, false);
});
