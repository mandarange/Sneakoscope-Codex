#!/usr/bin/env node
import { runProcess } from '../dist/core/fsx.js';

const entry = './dist/bin/sks.js';
const routes = ['$Image-UX-Review', '$QA-LOOP', '$PPT', '$Computer-Use', '$From-Chat-IMG'];
const results = [];

for (const route of routes) {
  const result = await runProcess(process.execPath, [entry, 'computer-use', 'require', '--route', route, '--json'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  const text = `${result.stdout}\n${result.stderr}`;
  let parsed = {};
  try { parsed = JSON.parse(result.stdout); } catch {}
  results.push({
    route,
    code: result.code,
    schema: parsed.schema || null,
    status: parsed.status || null,
    ok_or_structured_blocker: parsed.ok === true || ['available', 'codex_app_missing', 'macos_permission_missing', 'codex_app_capability_missing', 'external_capability_blocked', 'not_macos', 'unknown', 'web_verification_uses_chrome_extension'].includes(parsed.status),
    no_forbidden_wording: !/Computer Use blocked by safety policy|MAD-SKS disabled Computer Use|Computer Use access is unsafe/i.test(text),
    evidence_status: parsed.evidence?.status || null
  });
}

const ok = results.every((row) => row.schema === 'sks.computer-use-require.v1' && row.ok_or_structured_blocker && row.no_forbidden_wording);
console.log(JSON.stringify({
  schema: 'sks.computer-use-visual-route-fixture-check.v1',
  ok,
  results
}, null, 2));
if (!ok) process.exitCode = 1;
