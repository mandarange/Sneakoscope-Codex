#!/usr/bin/env node
// @ts-nocheck
import { assertFiles, assertGate, emitGate, importDist, SOURCE_INTELLIGENCE_FILES } from './sks-1-18-gate-lib.js';

assertFiles(SOURCE_INTELLIGENCE_FILES);
const mod = await importDist('core/source-intelligence/source-intelligence-policy.js');
const base = mod.buildSourceIntelligencePolicy({ query: 'current release notes', context7Available: true, codexWebCapability: { available: true, status: 'available', reason: 'fixture' } });
const xSearch = mod.buildSourceIntelligencePolicy({ query: 'site:x.com product launch', context7Available: true, codexWebCapability: { available: true, status: 'available', reason: 'fixture' }, xaiDetection: { configured: true, search_capable: true } });
const blocked = mod.buildSourceIntelligencePolicy({ query: 'npm package docs', context7Available: false });
assertGate(base.mode === 'ultra_balanced', 'default mode must be ultra_balanced', base);
assertGate(xSearch.mode === 'x_search' && xSearch.selected_providers.includes('x_public') && !Object.hasOwn(xSearch, ['xai', 'mcp'].join('_')), 'X-search mode must be provider-independent and ignore xAI detection', xSearch);
assertGate(blocked.mode === 'blocked' && blocked.blockers.includes('docs_context_missing'), 'Context7 missing must block docs context');
emitGate('source-intelligence:policy', { modes: [base.mode, xSearch.mode, blocked.mode] });
