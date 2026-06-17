#!/usr/bin/env node
import { assertGate, emitGate, readJson } from './sks-1-18-gate-lib.js';
import { REQUIRED_3113_REAL_CHECK_IDS, REQUIRED_3113_RELEASE_IDS } from './release-3113-required-gates.js';

const scripts = readJson('package.json').scripts || {};
const gates = readJson('release-gates.v2.json').gates || [];
const gateIds = new Set(gates.map((gate: any) => gate.id));
for (const id of REQUIRED_3113_RELEASE_IDS) {
  assertGate(Boolean(scripts[id]), `3.1.13 release script missing: ${id}`);
  assertGate(gateIds.has(id), `3.1.13 release gate missing: ${id}`);
}
for (const id of REQUIRED_3113_REAL_CHECK_IDS) {
  const gate = gates.find((entry: any) => entry.id === id);
  assertGate(Boolean(scripts[id]), `3.1.13 real-check script missing: ${id}`);
  assertGate(Boolean(gate) && gate.preset.includes('real-check'), `3.1.13 real-check gate missing real-check preset: ${id}`, gate);
}
emitGate('release:wiring-3113-blackbox', { release_ids: REQUIRED_3113_RELEASE_IDS.length, real_check_ids: REQUIRED_3113_REAL_CHECK_IDS.length });
