#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const enabled = process.env.SKS_TEST_REAL_IMAGEGEN === '1' || process.env.SKS_REAL_IMAGEGEN === '1';
const reportDir = path.join(process.cwd(), '.sneakoscope', 'reports');
const out = path.join(reportDir, 'real-imagegen-smoke-1.14.1.json');
const stableOut = path.join(reportDir, 'real-imagegen-smoke.json');
fs.mkdirSync(reportDir, { recursive: true });
function writeReport(report) {
  const text = `${JSON.stringify(report, null, 2)}\n`;
  fs.writeFileSync(out, text);
  fs.writeFileSync(stableOut, text);
}
if (!enabled) {
  const skipped = {
    schema: 'sks.imagegen-real-smoke.v1',
    ok: true,
    status: 'skipped',
    reason: 'Set SKS_TEST_REAL_IMAGEGEN=1 with OPENAI_API_KEY or Codex App imagegen output to run live smoke.',
    compatibility_env_alias: 'SKS_REAL_IMAGEGEN=1',
    release_gate: 'release:real-check_only',
    request_validator_checked: false,
    input_fidelity_present: false,
    local_only_artifact_policy: true
  };
  writeReport(skipped);
  console.log(JSON.stringify(skipped, null, 2));
  process.exit(0);
}
const started = Date.now();
const run = spawnSync(process.execPath, ['./dist/bin/sks.js', 'ux-review', 'run', '--image', 'test/fixtures/images/one-by-one.png', '--generate-callouts', '--fix', '--json'], {
  cwd: process.cwd(),
  env: process.env,
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024
});
const report = {
  schema: 'sks.imagegen-real-smoke.v1',
  ok: run.status === 0,
  status: run.status === 0 ? 'passed' : 'blocked',
  env_flag: 'SKS_TEST_REAL_IMAGEGEN',
  latency_ms: Date.now() - started,
  cost: 'not_reported_by_adapter',
  request_validator_checked: true,
  input_fidelity_present: /input_fidelity/.test(`${run.stdout}\n${run.stderr}`),
  local_only_artifact_policy: true,
  stdout_tail: run.stdout.slice(-4000),
  stderr_tail: run.stderr.slice(-4000)
};
if (report.input_fidelity_present) {
  report.ok = false;
  report.status = 'blocked';
  report.blocker = 'input_fidelity_must_not_be_sent_for_gpt_image_2';
}
writeReport(report);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
