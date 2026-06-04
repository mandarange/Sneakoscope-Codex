#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate, importDist, root } from './lib/codex-sdk-gate-lib.js';

const arbiterMod = await importDist('core/codex-control/gpt-final-arbiter.js');
const doctorMod = await importDist('core/doctor/doctor-readiness-matrix.js');
const old = snapshotEnv();

try {
  process.env.SKS_GPT_FINAL_ARBITER_UNAVAILABLE = '1';
  const unavailable = await arbiterMod.runGptFinalArbiter(input('unavailable'), { writeArtifact: false, forceUnavailable: true });
  assertGate(unavailable.ok === false, 'GPT unavailable fixture must block final apply');
  assertGate(unavailable.blockers.includes('gpt_final_arbiter_unavailable'), 'GPT unavailable blocker must be present');

  const doctor = doctorMod.buildDoctorReadinessMatrix({
    codex: { available: false },
    codex_config: { ok: true, checks: [] },
    local_collaboration: { mode: 'local-parallel-gpt-final', gpt_final_arbiter_available: false }
  });
  assertGate(doctor.blockers.includes('gpt_final_arbiter_unavailable'), 'doctor must report gpt_final_arbiter_unavailable');

  delete process.env.SKS_GPT_FINAL_ARBITER_UNAVAILABLE;
  process.env.NODE_ENV = 'test';
  process.env.SKS_CODEX_SDK_FAKE = '1';
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-gpt-final-available-'));
  const available = await arbiterMod.runGptFinalArbiter(input('available'), { cwd: root, mutationLedgerRoot: tmp });
  assertGate(available.ok === true, 'GPT available fixture must pass final arbiter');

  emitGate('local-collab:gpt-final-availability', { unavailable: unavailable.result.status, available: available.result.status });
} finally {
  restoreEnv(old);
}

function input(label) {
  return {
    schema: 'sks.gpt-final-arbiter-input.v1',
    route: '$Team',
    mission_id: `M-${label}`,
    local_mode: 'local-parallel-gpt-final',
    local_outputs: [{ worker_id: 'local', backend: 'local-llm', summary: 'candidate' }],
    candidate_patch_envelopes: [],
    verification_results: []
  };
}

function snapshotEnv() {
  return {
    NODE_ENV: process.env.NODE_ENV,
    SKS_CODEX_SDK_FAKE: process.env.SKS_CODEX_SDK_FAKE,
    SKS_GPT_FINAL_ARBITER_UNAVAILABLE: process.env.SKS_GPT_FINAL_ARBITER_UNAVAILABLE
  };
}

function restoreEnv(old) {
  for (const [key, value] of Object.entries(old)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
