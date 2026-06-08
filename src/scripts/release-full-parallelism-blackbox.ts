#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runReleaseGateBatch } from '../core/release/release-gate-batch-runner.js'
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'
const reportRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-release-full-'))
const gates = Array.from({ length: 80 }, (_, i) => ({ id: `synthetic:${i + 1}`, command: `${process.execPath} -e \"setTimeout(()=>process.exit(0),1000)\"`, deps: [], resource: ['cpu-light', 'fs-read'], side_effect: 'hermetic', timeout_ms: 15000, cache: { enabled: false, inputs: [] }, isolation: { home: 'temp', codex_home: 'temp', report_dir: 'per-gate' }, preset: ['release'] }))
const started = Date.now()
const result = await runReleaseGateBatch(root, gates, { concurrency: 40, reportRoot })
const wallMs = Date.now() - started
const sequential = 80_000
const gain = Number((sequential / Math.max(1, wallMs)).toFixed(2))
assertGate(result.ok === true, 'synthetic release gates failed', result)
assertGate(wallMs < 6000, 'release full parallelism wall time too slow', { wallMs, result })
assertGate(gain >= 10, 'release full parallelism gain below 10x', { gain, wallMs })
assertGate(result.batch_size === 80 && result.completed === 80, 'synthetic gate count mismatch', result)
emitGate('release:full-parallelism-blackbox', { wall_ms: wallMs, parallelism_gain: gain, max_running: 40, slowest_gates: result.results.sort((a, b) => b.duration_ms - a.duration_ms).slice(0, 5) })
