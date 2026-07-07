#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js'

const [{ DOLLAR_COMMANDS_LITE }, routes] = await Promise.all([
  importDist('core/routes/dollar-manifest-lite.js'),
  importDist('core/routes.js')
])

const routePrompt = routes.routePrompt
const rows = []
for (const entry of DOLLAR_COMMANDS_LITE) {
  const timings = []
  let routed = null
  for (let i = 0; i < 25; i++) {
    const started = performance.now()
    routed = routePrompt(`${entry.command} scorecard smoke`)
    timings.push(performance.now() - started)
  }
  timings.sort((a, b) => a - b)
  const p95 = timings[Math.min(timings.length - 1, Math.ceil(timings.length * 0.95) - 1)] || 0
  const metadataComplete = Boolean(entry.command && entry.route && entry.description)
  const stopGateOrExempt = Boolean(routed?.stopGate || routed?.coverageExemptReason || entry.command === '$Help' || entry.command === '$Answer')
  const cliSmokeOrPrompt = Boolean(routed?.cliEntrypoint || routed?.command || entry.command)
  const highRiskPolicy = !/\b(?:MAD|DB|Computer|CU|Commit|Push|Release)\b/i.test(entry.command) || Boolean(routed?.requiredSkills || routed?.lifecycle)
  const score =
    (p95 <= 20 ? 20 : 0) +
    (metadataComplete ? 20 : 0) +
    (stopGateOrExempt ? 20 : 0) +
    (cliSmokeOrPrompt ? 20 : 0) +
    (highRiskPolicy ? 20 : 0)
  rows.push({
    command: entry.command,
    route: entry.route,
    p95_ms: Number(p95.toFixed(3)),
    score,
    routed_id: routed?.id || null,
    stop_gate: routed?.stopGate || null
  })
}

const average = rows.reduce((sum, row) => sum + row.score, 0) / Math.max(1, rows.length)
const blockers = [
  ...rows.filter((row) => row.p95_ms > 20).map((row) => `${row.command}:route_prompt_p95_exceeded`),
  ...(average >= 94 ? [] : [`average_below_94:${average.toFixed(2)}`])
]
const report = {
  schema: 'sks.dollar-performance-scorecard.v1',
  ok: blockers.length === 0,
  generated_at: new Date().toISOString(),
  average_score: Number(average.toFixed(2)),
  dollar_command_count: rows.length,
  rows,
  blockers
}
const out = path.join(root, '.sneakoscope', 'reports', 'dollar-performance-scorecard.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)

assertGate(report.ok, 'dollar performance scorecard failed', report)
emitGate('dollar:performance-scorecard', { average_score: report.average_score, dollar_command_count: rows.length, report: '.sneakoscope/reports/dollar-performance-scorecard.json' })
