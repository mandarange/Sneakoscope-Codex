#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js';

const distCli = path.join(root, 'dist', 'bin', 'sks.js');

function run(extra = []) {
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
  ], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
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
if (defaultRun.fast_mode_policy?.preference_mode === 'fast') {
  assertGate(defaultRun.fast_mode_policy?.fast_mode === true && defaultRun.fast_mode_policy?.service_tier === 'fast', 'default run must honor saved fast preference', report);
} else {
  assertGate(defaultRun.fast_mode_policy?.fast_mode === false && defaultRun.fast_mode_policy?.service_tier === 'standard', 'default run without saved fast preference must record service_tier standard', report);
}
assertGate(fastRun.fast_mode_policy?.fast_mode === true, '--fast must enable fast mode', report);
assertGate(fastRun.fast_mode_policy?.service_tier === 'fast', '--fast must record service_tier fast', report);
assertGate(fastRun.fast_mode_propagation?.worker_process_report_count >= 2, 'worker process reports must record explicit fast mode', report);
assertGate(noFastRun.fast_mode_policy?.fast_mode === false && noFastRun.fast_mode_policy?.disabled_by === 'no-fast', '--no-fast must disable fast mode', report);
assertGate(standardRun.fast_mode_policy?.service_tier === 'standard' && standardRun.fast_mode_policy?.fast_mode === false, '--service-tier standard must record standard tier', report);
emitGate('agent:fast-mode-default', report.default);
