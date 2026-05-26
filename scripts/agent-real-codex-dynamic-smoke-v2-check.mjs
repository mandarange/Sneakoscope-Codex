#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.mjs';

const run = spawnSync(process.execPath, ['scripts/agent-real-codex-dynamic-smoke-check.mjs'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env },
  maxBuffer: 1024 * 1024 * 8,
  timeout: Number(process.env.SKS_REAL_SMOKE_TIMEOUT_MS || 10 * 60 * 1000)
});
assertGate(run.status === 0, 'real codex dynamic smoke v2 wrapper failed', { stdout: run.stdout.slice(-2000), stderr: run.stderr.slice(-2000), status: run.status });
emitGate('agent:real-codex-dynamic-smoke-v2', { status: 'delegated_to_v2_report' });
