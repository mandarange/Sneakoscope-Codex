#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/super-search/index.js');
const missionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-super-search-'));
const result = await mod.runSuperSearch({
  missionDir,
  query: 'npm package docs',
  mode: 'balanced',
  context7: async () => [{ title: 'npm docs', url: 'https://docs.npmjs.com', snippet: 'official docs' }],
  codexWebSearch: async () => [{ title: 'npm registry', url: 'https://www.npmjs.com/package/npm', snippet: 'registry' }],
  env: { SKS_CODEX_WEB_SEARCH_AVAILABLE: '1' }
});

assertGate(result.proof.provider_independent === true, 'Super-Search proof must be provider-independent', result.proof);
assertGate(result.proof.xai_runtime_dependency === false, 'Super-Search must not require xAI runtime', result.proof);
assertGate(result.sources.some((source) => source.acquisition_verdict === 'verified_content'), 'Super-Search must normalize verified source evidence', result.sources);
assertGate(result.convergence.schema === 'sks.super-search-convergence.v1', 'Super-Search convergence artifact must be typed', result.convergence);
emitGate('super-search:provider-interface', {
  mode: result.mode,
  sources: result.sources.length,
  verified: result.proof.verified_source_count,
  xai_runtime_dependency: result.proof.xai_runtime_dependency
});
