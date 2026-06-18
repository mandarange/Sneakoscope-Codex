#!/usr/bin/env node
import { assertGate, emitGate } from './sks-1-18-gate-lib.js';
import {
  CODEX_0141_FEATURE_KEYS,
  detectCodex0141Capability
} from '../core/codex-control/codex-0141-capability.js';

process.env.SKS_CODEX_0141_FAKE = '1';
process.env.SKS_CODEX_VERSION_FAKE = 'codex-cli 0.141.0';
const cap = await detectCodex0141Capability({ codexBin: 'codex' });
assertGate(cap.ok === true && cap.supports_0141 === true, 'Codex 0.141 capability fixture must pass', cap);
assertGate(Object.keys(cap.feature_states).length === CODEX_0141_FEATURE_KEYS.length, 'Codex 0.141 feature key count mismatch', cap);
assertGate(
  Object.values(cap.feature_states).every((state) => state.supported === true && state.certainty === 'assumed_by_version'),
  'version-only mode must mark 0.141 features as assumed by version',
  cap
);
assertGate(
  cap.feature_states.prompt_image_cache_bound_64_mib.sks_policy === 'bound'
    && cap.feature_states.feedback_upload_bound_8_threads.sks_policy === 'bound'
    && cap.feature_states.plugin_app_mcp_dedupe.sks_policy === 'dedupe',
  'Codex 0.141 SKS policies must encode bound/dedupe/delegate behavior',
  cap.feature_states
);
process.env.SKS_CODEX_VERSION_FAKE = 'codex-cli 0.140.0';
const old = await detectCodex0141Capability({ codexBin: 'codex' });
assertGate(old.ok === false && old.blockers.includes('codex_0_141_required_for_0141_features'), 'Codex 0.140 must not satisfy 0.141 capability', old);
emitGate('codex:0.141-compat', { features: CODEX_0141_FEATURE_KEYS.length });
