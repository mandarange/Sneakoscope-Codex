#!/usr/bin/env node
import { assertGate, emitGate } from './gate-lib.js';
import { CODEX_CURRENT_FEATURE_KEYS, detectCodexCurrentCapability, writeCodexCurrentCapabilityArtifacts } from '../core/codex-control/codex-current-capability.js';

const requireReal = process.argv.includes('--require-real') || process.env.SKS_REQUIRE_CODEX_CURRENT === '1';
const artifact = requireReal
  ? await writeCodexCurrentCapabilityArtifacts(process.cwd())
  : null;
const cap = artifact?.report || await detectCodexCurrentCapability({ root: process.cwd() });
assertGate(cap.ok === true, 'Current package-derived Codex capability probe must pass', cap);
assertGate(Object.keys(cap.feature_states).length === CODEX_CURRENT_FEATURE_KEYS.length, 'Current Codex feature count mismatch', cap);
assertGate(cap.probe_mode === 'real-schema', 'Current Codex capability must use runtime-generated schema evidence', cap);
assertGate(cap.release_authorizing === true, 'Current Codex capability must be release-authorizing', cap);
emitGate('codex:current:capability', {
  features: CODEX_CURRENT_FEATURE_KEYS.length,
  probe_mode: cap.probe_mode,
  release_authorizing: cap.release_authorizing
});
