#!/usr/bin/env node
// @ts-nocheck
import { spawnSync } from 'node:child_process'
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'
const timeoutMs = 540000
const prompt = [
  'Native parallelism proof smoke.',
  'For each assigned read-only work item, do not inspect repository files or artifacts.',
  'Immediately return status done, summary "real codex-sdk worker parallelism smoke completed", findings ["codex-sdk worker session active"], changed_files [], patch_envelopes [], blockers [], and verification status passed with checks ["no-op-readonly-worker-session"].',
  'This prompt exists only to prove native worker process concurrency; do not ask for artifact paths.'
].join(' ')
const args = [
  'dist/bin/sks.js',
  'naruto',
  'run',
  prompt,
  '--real',
  '--readonly',
  '--write-mode',
  'off',
  '--backend',
  'codex-sdk',
  '--no-ollama',
  '--clones',
  '32',
  '--work-items',
  '32',
  '--messages',
  '1',
  '--json',
  '--no-open-zellij'
]
const forbiddenMockFlag = ['--', 'mock'].join('')
assertGate(!args.includes(forbiddenMockFlag), 'real parallelism blackbox must not request mock mode', args)
const res = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 })
assertGate(res.status === 0, 'naruto real parallelism blackbox command failed', { status: res.status, signal: res.signal, error: res.error?.message || null, timeout_ms: timeoutMs, stderr: res.stderr.slice(-2000), stdout: res.stdout.slice(-2000) })
const jsonStart = res.stdout.indexOf('{')
const result = JSON.parse(res.stdout.slice(jsonStart))
const codexWorkerCount = Number(result.local_worker?.backend_counts?.['codex-sdk'] || 0)
const safeActiveWorkers = Number(result.concurrency_governor?.safe_active_workers || 0)
const requiredActiveWorkers = Math.max(16, Math.min(32, safeActiveWorkers || Number(result.target_active_slots || 0) || 32))
const requiredSpeedupRatio = 3
assertGate(result.backend === 'codex-sdk' && result.run?.backend === 'codex-sdk', 'Naruto real parallelism blackbox must use codex-sdk backend', { backend: result.backend, run_backend: result.run?.backend })
assertGate(codexWorkerCount >= 32, 'Naruto real parallelism blackbox must prove codex-sdk worker sessions', result.local_worker)
assertGate(result.fake_backend_disclaimer !== true && result.run?.proof?.fake_backend_disclaimer !== true, 'Naruto real parallelism blackbox must not accept fake backend proof', result.run?.proof || result)
assertGate(result.clones >= 32 && result.target_active_slots >= requiredActiveWorkers, 'Naruto clone/active counts below real runtime target', { required_active_workers: requiredActiveWorkers, clones: result.clones, target_active_slots: result.target_active_slots, governor: result.concurrency_governor })
assertGate(result.run?.scheduler?.state?.max_observed_active_slots >= requiredActiveWorkers, 'scheduler max observed active slots below real runtime target', { required_active_workers: requiredActiveWorkers, scheduler: result.run?.scheduler })
assertGate(result.parallel_runtime?.passed === true && result.parallel_runtime?.speedup_ratio >= requiredSpeedupRatio, 'parallel runtime proof did not pass Naruto gate', { required_speedup_ratio: requiredSpeedupRatio, proof: result.parallel_runtime })
assertGate(result.parallel_runtime?.unique_worker_pids >= 32, 'parallel runtime proof must observe at least 32 worker processes', result.parallel_runtime)
assertGate(result.parallel_runtime.visible_panes <= result.target_active_slots && result.parallel_runtime.headless_workers >= 0, 'visible/headless proof missing', result.parallel_runtime)
emitGate('naruto:real-parallelism-blackbox', result.parallel_runtime)
