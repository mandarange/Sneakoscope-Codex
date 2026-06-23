#!/usr/bin/env node
import { assertGate, emitGate } from './sks-1-18-gate-lib.js';
import { CODEX_0142_FEATURE_KEYS, detectCodex0142Capability, writeCodex0142CapabilityArtifacts } from '../core/codex-control/codex-0142-capability.js';

const requireReal = process.argv.includes('--require-real') || process.env.SKS_REQUIRE_CODEX_0142 === '1';
if (!requireReal) process.env.SKS_CODEX_0142_FAKE = '1';
const cap = await detectCodex0142Capability({ requireReal });
assertGate(cap.ok === true, 'Codex 0.142 capability probe must pass', cap);
assertGate(Object.keys(cap.feature_states).length === CODEX_0142_FEATURE_KEYS.length, 'Codex 0.142 feature count mismatch', cap);
assertGate(
  Object.values(cap.feature_states).every((state) => String(state.certainty) !== 'assumed_by_version'),
  'Codex 0.142 capability must not use assumed_by_version evidence',
  cap
);
if (requireReal) {
  assertGate(cap.probe_mode === 'real-schema', 'Codex 0.142 require-real must use generated schema evidence', cap);
  assertGate(cap.release_authorizing === true, 'Codex 0.142 require-real must be release-authorizing', cap);
  await writeCodex0142CapabilityArtifacts(process.cwd(), { requireReal: true });
}
emitGate('codex:0142-capability', {
  features: CODEX_0142_FEATURE_KEYS.length,
  probe_mode: cap.probe_mode,
  release_authorizing: cap.release_authorizing
});
