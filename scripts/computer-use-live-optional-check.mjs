#!/usr/bin/env node
import { runProcess } from '../dist/core/fsx.js';

const entry = './dist/bin/sks.js';
const result = await runProcess(process.execPath, [entry, 'computer-use', 'smoke', '--json'], {
  env: { ...process.env, CI: 'true', SKS_TEST_REAL_COMPUTER_USE: '' },
  timeoutMs: 20_000,
  maxOutputBytes: 256 * 1024
});

const text = `${result.stdout}\n${result.stderr}`;
let parsed = {};
try { parsed = JSON.parse(result.stdout); } catch {}

const structuredStatus = ['available', 'codex_app_missing', 'macos_permission_missing', 'codex_app_capability_missing', 'external_capability_blocked', 'not_macos', 'unknown'].includes(parsed.status);
const ok = result.code === 0
  && parsed.schema === 'sks.computer-use-live-smoke.v1'
  && parsed.ok === true
  && structuredStatus
  && parsed.mock === false
  && !/Computer Use blocked by safety policy|MAD-SKS disabled Computer Use|Computer Use access is unsafe/i.test(text);

console.log(JSON.stringify({
  schema: 'sks.computer-use-live-optional-check.v1',
  ok,
  status: parsed.status || null,
  mode: parsed.mode || null,
  structured_status: structuredStatus
}, null, 2));
if (!ok) process.exitCode = 1;
