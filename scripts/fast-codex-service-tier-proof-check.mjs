#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });

const syntax = await import(pathToFileURL(path.join(root, 'dist', 'core', 'codex', 'codex-cli-syntax-builder.js')).href);
const fastMode = await import(pathToFileURL(path.join(root, 'dist', 'core', 'agents', 'fast-mode-policy.js')).href);
const args = syntax.buildCodexExecArgs({ prompt: 'fixture', sandbox: 'workspace-write', serviceTier: 'fast' });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-fast-tier-proof-'));
const reportDir = path.join(temp, 'sessions', 'agent');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'agent-process-report.json'), `${JSON.stringify({
  schema: 'sks.agent-process-report.v1',
  backend: 'codex-exec',
  fast_mode: true,
  service_tier: 'fast',
  service_tier_cli_override_present: args.includes('-c') && args.includes('service_tier=fast')
})}\n`);
fs.writeFileSync(path.join(reportDir, 'worker-fast-mode.json'), `${JSON.stringify({
  schema: 'sks.native-cli-worker-fast-mode.v1',
  fast_mode: true,
  service_tier: 'fast'
})}\n`);
const proof = await fastMode.writeFastModePropagationProof(temp, { policy: fastMode.resolveFastModePolicy() });
const ok = args.includes('-c')
  && args.includes('service_tier=fast')
  && !args.includes('--full-auto')
  && !args.includes('--dangerously-bypass-approvals-and-sandbox')
  && proof.ok === true;

console.log(JSON.stringify({ schema: 'sks.fast-codex-service-tier-proof-check.v1', ok, args, proof }, null, 2));
if (!ok) process.exitCode = 1;

function fail(blocker, detail) {
  console.log(JSON.stringify({ schema: 'sks.fast-codex-service-tier-proof-check.v1', ok: false, blocker, detail }, null, 2));
  process.exit(1);
}
