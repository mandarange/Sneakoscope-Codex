#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js'
import { runProcess } from '../core/fsx.js'

const { COMMAND_MANIFEST_LITE } = await importDist('cli/command-manifest-lite.js')
const smokeCommands = [
  { name: 'version', argv: ['--version'], budget_p95_ms: 120 },
  { name: 'commands', argv: ['commands', '--json'], budget_p95_ms: 200 },
  { name: 'root', argv: ['root', '--json'], budget_p95_ms: 150 },
  { name: 'dollar-commands', argv: ['dollar-commands', '--json'], budget_p95_ms: 220 },
  { name: 'super-search', argv: ['super-search', 'doctor', '--json'], budget_p95_ms: 180 },
  { name: 'doctor', argv: ['doctor', '--json'], budget_p95_ms: 1200 }
]

const timings = []
for (const smoke of smokeCommands) timings.push(await measure(smoke))
const timingByName = new Map(timings.map((row) => [row.name, row]))

const entries = COMMAND_MANIFEST_LITE.filter((entry) => entry.hidden !== true)
const rows = entries.map((entry) => scoreEntry(entry, timingByName.get(entry.name)))
const average = rows.reduce((sum, row) => sum + row.score, 0) / Math.max(1, rows.length)
const blockers = [
  ...(average >= 94 ? [] : [`average_below_94:${average.toFixed(2)}`])
]
const report = {
  schema: 'sks.command-performance-scorecard.v1',
  ok: blockers.length === 0,
  generated_at: new Date().toISOString(),
  average_score: Number(average.toFixed(2)),
  command_count: rows.length,
  timings,
  rows,
  blockers
}
const out = path.join(root, '.sneakoscope', 'reports', 'command-performance-scorecard.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)

assertGate(report.ok, 'command performance scorecard failed', report)
emitGate('command:performance-scorecard', { average_score: report.average_score, command_count: rows.length, report: '.sneakoscope/reports/command-performance-scorecard.json' })

function scoreEntry(entry, timing) {
  const hasRunnableSurface = Boolean(timing || entry.summary || entry.readonly || entry.diagnostic || entry.skipMigrationGate || entry.mutatesRouteState)
  const p95Ok = timing ? timing.ok : true
  const jsonContract = timing ? timing.json_contract : true
  const failureSummary = Boolean(entry.summary)
  const installedReady = Array.isArray(entry.packageRequiredFiles)
    ? entry.packageRequiredFiles.every((file) => fs.existsSync(path.join(root, file)))
    : true
  const score =
    (hasRunnableSurface ? 25 : 0) +
    (p95Ok ? 25 : 0) +
    (jsonContract ? 15 : 0) +
    (failureSummary ? 15 : 0) +
    (installedReady ? 20 : 0)
  return { name: entry.name, maturity: entry.maturity, score, p95_ms: timing?.p95_ms ?? null, smoke: Boolean(timing), summary: entry.summary }
}

async function measure(smoke) {
  const durations = []
  const exitCodes = []
  let jsonContract = false
  for (let i = 0; i < 3; i++) {
    const started = performance.now()
    const result = await runProcess(process.execPath, [path.join(root, 'dist', 'bin', 'sks.js'), ...smoke.argv], {
      cwd: root,
      timeoutMs: 15_000,
      maxOutputBytes: 128 * 1024,
      env: { SKS_DISABLE_NETWORK: '1', SKS_DISABLE_UPDATE_CHECK: '1', SKS_PERF_MEASURE: '1' }
    })
    durations.push(Math.round(performance.now() - started))
    exitCodes.push(result.code)
    jsonContract ||= smoke.argv.includes('--json') ? parsesJson(result.stdout) : String(result.stdout || '').trim().length > 0
  }
  durations.sort((a, b) => a - b)
  const p95 = durations[Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)] || 0
  return { name: smoke.name, p95_ms: p95, budget_p95_ms: smoke.budget_p95_ms, ok: p95 <= smoke.budget_p95_ms && exitCodes.every((code) => code === 0), exit_codes: exitCodes, json_contract: jsonContract }
}

function parsesJson(value) {
  try {
    JSON.parse(String(value || ''))
    return true
  } catch {
    return false
  }
}
