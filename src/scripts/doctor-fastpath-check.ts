#!/usr/bin/env node
// @ts-nocheck
import { spawnSync } from 'node:child_process'
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'

const started = Date.now()
const result = spawnSync(process.execPath, ['dist/bin/sks.js', 'doctor', '--json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024
})
const elapsedMs = Date.now() - started
const parsed = JSON.parse(result.stdout || '{}')

assertGate(result.status === 0, 'doctor --json must exit 0', { status: result.status, stderr: result.stderr.slice(-2000), stdout: result.stdout.slice(-2000) })
assertGate(parsed.doctor_fix_transaction === null, 'doctor --json no-fix must not run fix transaction', parsed.doctor_fix_transaction)
assertGate(parsed.repair?.setup === null, 'doctor --json no-fix must not run setup repair', parsed.repair?.setup)
assertGate(parsed.repair?.sks_temp_sweep?.skipped === true, 'doctor --json no-fix must not sweep runtime state', parsed.repair?.sks_temp_sweep)
assertGate(elapsedMs <= 1200, 'doctor --json fast path must stay under 1200ms p95 target in this gate', { elapsed_ms: elapsedMs })

emitGate('doctor:fastpath', { elapsed_ms: elapsedMs })
