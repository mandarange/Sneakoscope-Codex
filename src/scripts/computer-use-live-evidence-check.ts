#!/usr/bin/env node
// @ts-nocheck
import { runProcess } from '../core/fsx.js';

const entry = './dist/bin/sks.js';
const probe = await runProcess(process.execPath, [entry, 'computer-use', 'smoke', '--json'], {
  env: { ...process.env, CI: 'true', SKS_TEST_REAL_COMPUTER_USE: '' },
  timeoutMs: 20_000,
  maxOutputBytes: 256 * 1024
});
const real = await runProcess(process.execPath, [entry, 'computer-use', 'smoke', '--real', '--capture-screenshot', '--json'], {
  env: { ...process.env, CI: 'true', SKS_TEST_REAL_COMPUTER_USE: '' },
  timeoutMs: 20_000,
  maxOutputBytes: 256 * 1024
});

const probeJson = parseJson(probe.stdout);
const realJson = parseJson(real.stdout);
const text = `${probe.stdout}\n${probe.stderr}\n${real.stdout}\n${real.stderr}`;
const forbidden = /mock.*live|fabricated|Computer Use blocked by safety policy|MAD-SKS disabled Computer Use/i.test(text);
const ok = probe.code === 0
  && probeJson.schema === 'sks.computer-use-live-smoke.v2'
  && probeJson.evidence_mode === 'probe_only'
  && probeJson.mock === false
  && realJson.schema === 'sks.computer-use-live-smoke.v2'
  && ['probe_only', 'live_capture_attempted', 'live_capture_success', 'live_capture_blocked'].includes(realJson.evidence_mode)
  && realJson.mock === false
  && Boolean(realJson.live_evidence_path)
  && forbidden === false;

console.log(JSON.stringify({
  schema: 'sks.computer-use-live-evidence-check.v1',
  ok,
  probe: {
    code: probe.code,
    status: probeJson.status || null,
    evidence_mode: probeJson.evidence_mode || null
  },
  real: {
    code: real.code,
    status: realJson.status || null,
    evidence_mode: realJson.evidence_mode || null,
    live_evidence_path: realJson.live_evidence_path || null,
    image_voxel_linked: realJson.image_voxel_linked === true
  },
  forbidden_wording: forbidden
}, null, 2));
if (!ok) process.exitCode = 1;

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
