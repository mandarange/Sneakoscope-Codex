#!/usr/bin/env node
import { assertFiles, assertGate, emitGate, importDist, SOURCE_INTELLIGENCE_FILES } from './sks-1-18-gate-lib.mjs';

assertFiles(SOURCE_INTELLIGENCE_FILES);
const mod = await importDist('core/source-intelligence/source-intelligence-policy.js');
const base = mod.buildSourceIntelligencePolicy({ context7Available: true, codexWebCapability: { available: true, status: 'available', reason: 'fixture' }, xaiDetection: { configured: false, search_capable: false, configured_but_unverified: false, status: 'missing' } });
const xai = mod.buildSourceIntelligencePolicy({ context7Available: true, codexWebCapability: { available: true, status: 'available', reason: 'fixture' }, xaiDetection: { configured: true, search_capable: true, configured_but_unverified: false, status: 'search_capable' } });
const blocked = mod.buildSourceIntelligencePolicy({ context7Available: false });
assertGate(base.mode === 'context7_codex_web', 'default mode must be context7_codex_web', base);
assertGate(xai.mode === 'context7_codex_web_xai' && xai.xai_mcp.required === true, 'X AI available mode must require X evidence', xai);
assertGate(blocked.mode === 'blocked' && blocked.blockers.includes('docs_context_missing'), 'Context7 missing must block docs context');
emitGate('source-intelligence:policy', { modes: [base.mode, xai.mode, blocked.mode] });
