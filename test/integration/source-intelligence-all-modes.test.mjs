import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runSourceIntelligence } from '../../dist/core/source-intelligence/source-intelligence-runner.js';

test('runs source intelligence through UltraSearch v2 modes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-source-int-'));
  const common = {
    missionDir: dir,
    query: 'query',
    context7: async () => [{ title: 'docs' }],
    codexWebSearch: async () => [{ title: 'web', url: 'https://example.com' }],
    env: { SKS_CODEX_WEB_SEARCH_AVAILABLE: '1' }
  };
  const balanced = await runSourceIntelligence({ ...common });
  assert.equal(balanced.ok, true);
  assert.equal(balanced.mode, 'ultra_balanced');
  const xSearch = await runSourceIntelligence({ ...common, query: 'site:x.com product launch', xaiDetection: { configured: true, search_capable: true } });
  assert.equal(xSearch.ok, false);
  assert.equal(xSearch.mode, 'x_search');
  assert.ok(xSearch.blockers.includes('x_search_parity_not_proven'));
});
