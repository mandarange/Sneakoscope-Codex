#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/source-intelligence/source-intelligence-runner.js');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-source-intelligence-'));
const noXai = await mod.runSourceIntelligence({
  missionDir: dir,
  route: '$Team',
  query: 'fixture',
  context7: async () => [{ title: 'docs' }],
  codexWebSearch: async () => [{ title: 'web', url: 'https://example.com' }],
  xaiDetection: { configured: false, search_capable: false, configured_but_unverified: false, status: 'missing' },
  env: { SKS_CODEX_WEB_SEARCH_AVAILABLE: '1' }
});
const withXai = await mod.runSourceIntelligence({
  missionDir: dir,
  route: '$Research',
  query: 'fixture',
  context7: async () => [{ title: 'docs' }],
  codexWebSearch: async () => [{ title: 'web', url: 'https://example.com' }],
  xaiSearch: async () => [{ title: 'x', url: 'https://x.ai' }],
  xaiDetection: { configured: true, search_capable: true, configured_but_unverified: false, status: 'search_capable' },
  env: { SKS_CODEX_WEB_SEARCH_AVAILABLE: '1' }
});
assertGate(noXai.ok === true && noXai.mode === 'context7_codex_web', 'no-XAI mode must pass with Context7+Codex Web', noXai);
assertGate(withXai.ok === true && withXai.mode === 'context7_codex_web_xai', 'XAI mode must pass with all providers', withXai);
assertGate(withXai.parallel.providers_requested.length === 3, 'providers must run through parallel provider plan', withXai.parallel);
emitGate('source-intelligence:all-modes', { modes: [noXai.mode, withXai.mode] });
