#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js';

const distCli = path.join(root, 'dist', 'bin', 'sks.js');

function run(extra = []) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-agent-fast-mode-fixture-'));
  const fixtureHome = path.join(fixtureRoot, 'home');
  try {
    return JSON.parse(execFileSync(process.execPath, [
      distCli,
      'agent',
      'run',
      'fast mode default fixture',
      '--mock',
      '--agents',
      '2',
      '--concurrency',
      '2',
      '--work-items',
      '2',
      '--minimum-work-items',
      '2',
      '--json',
      ...extra
    ], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: fixtureHome,
        CODEX_HOME: path.join(fixtureHome, '.codex'),
        SKS_GLOBAL_ROOT: path.join(fixtureHome, '.sneakoscope-global'),
        TMPDIR: fixtureRoot,
        TMP: fixtureRoot,
        TEMP: fixtureRoot,
        PWD: fixtureRoot,
        SKS_TEST_ISOLATION: '1',
        SKS_UPDATE_MIGRATION_GATE_DISABLED: '1',
        NODE_ENV: 'test',
        CI: 'true'
      },
      maxBuffer: 32 * 1024 * 1024
    }));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

const defaultRun = run();
const fastRun = run(['--fast']);
const noFastRun = run(['--no-fast']);
const standardRun = run(['--service-tier', 'standard']);
const report = {
  schema: 'sks.agent-fast-mode-default-check.v1',
  ok: true,
  default: {
    mission_id: defaultRun.mission_id,
    fast_mode: defaultRun.fast_mode_policy?.fast_mode,
    service_tier: defaultRun.fast_mode_policy?.service_tier,
    default_fast_mode: defaultRun.fast_mode_policy?.default_fast_mode,
    preference_mode: defaultRun.fast_mode_policy?.preference_mode,
    explicit_fast: defaultRun.fast_mode_policy?.explicit_fast,
    explicit_service_tier: defaultRun.fast_mode_policy?.explicit_service_tier,
    worker_report_count: defaultRun.fast_mode_propagation?.worker_process_report_count
  },
  no_fast: {
    mission_id: noFastRun.mission_id,
    fast_mode: noFastRun.fast_mode_policy?.fast_mode,
    service_tier: noFastRun.fast_mode_policy?.service_tier,
    disabled_by: noFastRun.fast_mode_policy?.disabled_by
  },
  fast: {
    mission_id: fastRun.mission_id,
    fast_mode: fastRun.fast_mode_policy?.fast_mode,
    service_tier: fastRun.fast_mode_policy?.service_tier,
    worker_report_count: fastRun.fast_mode_propagation?.worker_process_report_count
  },
  standard: {
    mission_id: standardRun.mission_id,
    fast_mode: standardRun.fast_mode_policy?.fast_mode,
    service_tier: standardRun.fast_mode_policy?.service_tier,
    disabled_by: standardRun.fast_mode_policy?.disabled_by
  }
};
const out = path.join(root, '.sneakoscope', 'reports', 'agent-fast-mode-default.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

assertGate(defaultRun.ok === true, 'default agent run must pass', report);
assertGate(defaultRun.fast_mode_policy?.explicit_fast === false && defaultRun.fast_mode_policy?.explicit_service_tier === null, 'default run must not use explicit fast/service-tier flags', report);
assertGate(defaultRun.fast_mode_policy?.default_fast_mode === true, 'built-in Fast default must be recorded', report);
if (defaultRun.fast_mode_policy?.preference_mode === 'standard') {
  assertGate(defaultRun.fast_mode_policy?.fast_mode === false && defaultRun.fast_mode_policy?.service_tier === 'standard', 'default run must honor saved standard preference', report);
} else {
  assertGate(defaultRun.fast_mode_policy?.fast_mode === true && defaultRun.fast_mode_policy?.service_tier === 'fast', 'default run without a saved standard preference must use Fast', report);
}
assertGate(fastRun.fast_mode_policy?.fast_mode === true, '--fast must enable fast mode', report);
assertGate(fastRun.fast_mode_policy?.service_tier === 'fast', '--fast must record service_tier fast', report);
assertGate(fastRun.fast_mode_propagation?.worker_process_report_count >= 2, 'worker process reports must record explicit fast mode', report);
assertGate(noFastRun.fast_mode_policy?.fast_mode === false && noFastRun.fast_mode_policy?.disabled_by === 'no-fast', '--no-fast must disable fast mode', report);
assertGate(standardRun.fast_mode_policy?.service_tier === 'standard' && standardRun.fast_mode_policy?.fast_mode === false, '--service-tier standard must record standard tier', report);
emitGate('agent:fast-mode-default', report.default);
