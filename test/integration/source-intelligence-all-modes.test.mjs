import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runSourceIntelligence } from '../../dist/core/source-intelligence/source-intelligence-runner.js';

test('runs source intelligence in no-XAI and XAI modes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-source-int-'));
  const common = {
    missionDir: dir,
    query: 'query',
    context7: async () => [{ title: 'docs' }],
    codexWebSearch: async () => [{ title: 'web', url: 'https://example.com' }],
    env: { SKS_CODEX_WEB_SEARCH_AVAILABLE: '1' }
  };
  const noXai = await runSourceIntelligence({ ...common, xaiDetection: { configured: false, search_capable: false, configured_but_unverified: false, status: 'missing' } });
  assert.equal(noXai.ok, true);
  assert.equal(noXai.mode, 'context7_codex_web');
  const withXai = await runSourceIntelligence({ ...common, xaiSearch: async () => [{ title: 'x', url: 'https://x.ai' }], xaiDetection: { configured: true, search_capable: true, configured_but_unverified: false, status: 'search_capable' } });
  assert.equal(withXai.ok, true);
  assert.equal(withXai.mode, 'context7_codex_web_xai');
});
