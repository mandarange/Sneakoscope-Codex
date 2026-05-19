#!/usr/bin/env node
import { runProcess } from '../dist/core/fsx.js';

const entry = './dist/bin/sks.js';
const status = await runProcess(process.execPath, [entry, 'computer-use', 'status', '--json'], {
  env: { ...process.env, CI: 'true' },
  timeoutMs: 20_000,
  maxOutputBytes: 256 * 1024
});
const text = `${status.stdout}\n${status.stderr}`;
const forbidden = [
  /Computer Use blocked by safety policy/i,
  /Computer Use access is unsafe/i,
  /MAD-SKS disabled Computer Use/i,
  /Computer Use 접근이 안전 정책상 차단/i
].filter((pattern) => pattern.test(text)).map(String);

let parsed = {};
try { parsed = JSON.parse(status.stdout); } catch {}
const allowedStatus = ['available', 'codex_app_missing', 'macos_permission_missing', 'codex_app_capability_missing', 'external_capability_blocked', 'not_macos', 'unknown'];
const ok = status.code === 0
  && parsed.schema === 'sks.computer-use-status.v1'
  && allowedStatus.includes(parsed.status)
  && parsed.mad_sks_independent === true
  && forbidden.length === 0;

console.log(JSON.stringify({
  schema: 'sks.computer-use-policy-check.v1',
  ok,
  status_code: status.code,
  computer_use_status: parsed.status || null,
  forbidden
}, null, 2));

if (!ok && forbidden.length) await recordComputerUseWrongness(forbidden);
if (!ok) process.exitCode = 1;

async function recordComputerUseWrongness(forbidden) {
  const { addWrongnessRecord } = await import('../dist/core/triwiki-wrongness/wrongness-ledger.js');
  await addWrongnessRecord(process.cwd(), {
    route: '$Computer-Use',
    wrongness_kind: 'route_misclassification',
    severity: 'high',
    claim: { text: `Computer Use was described with forbidden safety/MAD-SKS block wording: ${forbidden.join(', ')}` },
    detected_by: {
      source: 'computer_use_policy_check',
      command: 'npm run computer-use:policy-check',
      artifact: 'scripts/computer-use-policy-check.mjs',
      detail: forbidden.join(', ')
    },
    root_cause: {
      category: 'route_policy_gap',
      explanation: 'Computer Use is a Codex App/macOS capability check, not a MAD-SKS or generic SKS safety block.'
    },
    corrective_action: {
      summary: 'Separate Computer Use availability from safety policy wording and rerun the policy fixture.',
      required_evidence: ['npm run computer-use:policy-check'],
      patch_status: 'pending'
    },
    avoidance_rule: {
      text: 'Do not classify macOS Computer Use as MAD-SKS or generic SKS safety block.',
      applies_to: ['computer-use', '$Computer-Use', '$QA-LOOP', '$Image-UX-Review'],
      severity: 'high'
    },
    links: { tests: ['npm run computer-use:policy-check'], files: ['scripts/computer-use-policy-check.mjs'] }
  });
}
