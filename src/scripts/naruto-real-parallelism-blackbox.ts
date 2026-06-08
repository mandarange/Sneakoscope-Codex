#!/usr/bin/env node
// @ts-nocheck
import { spawnSync } from 'node:child_process'
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'
const res = spawnSync(process.execPath, ['dist/bin/sks.js', 'naruto', 'run', 'parallelism blackbox', '--mock', '--clones', '32', '--work-items', '64', '--concurrency', '32', '--json', '--no-open-zellij'], { cwd: root, encoding: 'utf8', timeout: 600000 })
assertGate(res.status === 0, 'naruto real parallelism blackbox command failed', { status: res.status, stderr: res.stderr.slice(-2000), stdout: res.stdout.slice(-2000) })
const jsonStart = res.stdout.indexOf('{')
const result = JSON.parse(res.stdout.slice(jsonStart))
assertGate(result.clones >= 32 && result.target_active_slots >= 32, 'Naruto clone/active counts below target', result)
assertGate(result.run?.scheduler?.state?.max_observed_active_slots >= 32, 'scheduler max observed active slots below 32', result.run?.scheduler)
assertGate(result.parallel_runtime?.passed === true && result.parallel_runtime?.speedup_ratio >= 5, 'parallel runtime proof did not pass Naruto gate', result.parallel_runtime)
assertGate(result.parallel_runtime.visible_panes <= result.target_active_slots && result.parallel_runtime.headless_workers >= 0, 'visible/headless proof missing', result.parallel_runtime)
emitGate('naruto:real-parallelism-blackbox', result.parallel_runtime)
