#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runReleaseGateDag } from '../core/release/release-gate-dag.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const presetIndex = args.indexOf('--preset')
const preset = presetIndex >= 0 ? args[presetIndex + 1] : 'release'
const changedSinceIndex = args.indexOf('--changed-since')
const changedSince = changedSinceIndex >= 0 ? (args[changedSinceIndex + 1] || null) : null

const result = await runReleaseGateDag({
  root,
  ...(preset === undefined ? {} : { preset }),
  changedSince,
  full: args.includes('--full'),
  explain: args.includes('--explain'),
  noCache: args.includes('--no-cache'),
  failFast: args.includes('--fail-fast')
})

console.log(`SKS Release DAG
  gates: ${result.total_gates} total, ${result.selected_gates} selected, ${result.cached} cached
  affected: ${result.affected_selection?.mode || 'full'} selected=${result.selected_gate_ids.length} skipped=${result.skipped_by_affected.length}
  concurrency: ${result.budget_summary}
  peak_running: ${result.peak_running}
  completed: ${result.completed} pass, ${result.failed} fail
  wall: ${(result.wall_ms / 1000).toFixed(1)}s
  parallelism_gain: ${result.parallelism_gain}
  cpu_time_saved: ${(result.cpu_time_saved_ms / 1000).toFixed(1)}s
  critical_path: ${(result.critical_path_ms / 1000).toFixed(1)}s
  report: ${result.report_dir}`)

if (!result.ok) {
  for (const failure of result.failures) {
    console.error(`[fail] ${failure.id} exit=${failure.exit_code}\n${failure.stderr_tail}`)
  }
  process.exit(1)
}
