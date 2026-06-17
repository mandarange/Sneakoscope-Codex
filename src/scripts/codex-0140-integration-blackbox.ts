#!/usr/bin/env node
import { assertGate, emitGate } from './sks-1-18-gate-lib.js';
import { detectCodex0140Capability } from '../core/codex-control/codex-0140-capability.js';

process.env.SKS_CODEX_0140_FAKE = '1';
process.env.SKS_CODEX_VERSION_FAKE = 'codex-cli 0.140.0';
process.env.SKS_CODEX_0140_PROBE = '1';
const report = await detectCodex0140Capability({ codexBin: 'codex' });
assertGate(report.ok === true && Object.values(report.features).every(Boolean), 'Codex 0.140 integration blackbox requires every fixture feature', report);
assertGate(Object.values(report.feature_states).every((state) => state.supported === true && state.certainty === 'fixture'), 'Codex 0.140 integration blackbox requires explicit fixture feature states', report);
assertGate(Object.keys(report.feature_certainty).length === Object.keys(report.features).length, 'Codex 0.140 integration blackbox requires per-feature certainty coverage', report);
assertGate(JSON.stringify(report).includes('SUPABASE_ACCESS_TOKEN') === false, 'Codex 0.140 blackbox must not serialize secret env values', report);
emitGate('codex:0140-integration-blackbox', { feature_count: Object.keys(report.features).length });
