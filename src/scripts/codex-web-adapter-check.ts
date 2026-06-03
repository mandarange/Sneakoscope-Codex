#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/codex/codex-web-search-adapter.js');
const available = mod.detectCodexWebSearchCapability({ env: { SKS_CODEX_WEB_SEARCH_AVAILABLE: '1' } });
const offline = mod.detectCodexWebSearchCapability({ offline: true });
const evidence = await mod.runCodexWebSearch('fixture', { search: async () => [{ title: 'result', url: 'https://example.com' }], env: { SKS_CODEX_WEB_SEARCH_AVAILABLE: '1' } });
assertGate(available.available === true, 'Codex Web capability env detector must pass');
assertGate(offline.status === 'disabled_offline', 'offline mode must disable web search with reason');
assertGate(evidence.ok === true && evidence.normalized_results.length === 1, 'Codex Web adapter must normalize results');
emitGate('codex-web:adapter', { status: evidence.status, results: evidence.normalized_results.length });
