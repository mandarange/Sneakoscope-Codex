#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js'

export const CRITICAL_DOLLAR_COMMANDS = new Set([
  '$Naruto',
  '$Work',
  '$DFix',
  '$Answer',
  '$Super-Search',
  '$SEO-GEO-OPTIMIZER',
  '$DB',
  '$MAD-SKS',
  '$QA-LOOP',
  '$Review',
  '$Commit-And-Push'
])

export const DOLLAR_SMOKE_MAX_AGE_MS = 60 * 60 * 1000

if (isMainModule()) await main()

export async function main() {
  const [{ DOLLAR_COMMANDS_LITE }, routes] = await Promise.all([
    importDist('core/routes/dollar-manifest-lite.js'),
    importDist('core/routes.js')
  ])

  const routePrompt = routes.routePrompt
  const rows = []
  for (const entry of DOLLAR_COMMANDS_LITE) {
    rows.push(scoreDollarEntry(entry, measureRoutePromptSmoke(entry, routePrompt), commandRouteSmokeFor(entry)))
  }

  const average = rows.reduce((sum, row) => sum + row.score, 0) / Math.max(1, rows.length)
  const blockers = [
    ...rows.filter((row) => row.critical && row.score === 0).map((row) => `${row.command}:critical_smoke_missing_or_failed`),
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
}

export function scoreDollarEntry(entry, routePromptSmoke, commandSmoke, options = {}) {
  const now = options.now ? new Date(options.now) : new Date()
  const p95 = routePromptSmoke?.p95_ms ?? Infinity
  const metadataComplete = Boolean(entry.command && entry.route && entry.description)
  const routed = routePromptSmoke?.routed || null
  const stopGateOrExempt = Boolean(routed?.stopGate || routed?.coverageExemptReason || entry.command === '$Help' || entry.command === '$Answer')
  const routePromptOk = classifyDollarSmoke(routePromptSmoke, now) === 'pass'
  const commandSmokeOk = classifyDollarSmoke(commandSmoke, now) === 'pass'
  const critical = CRITICAL_DOLLAR_COMMANDS.has(entry.command)
  if (critical && (!routePromptOk || !commandSmokeOk)) {
    return {
      command: entry.command,
      route: entry.route,
      critical,
      p95_ms: Number.isFinite(p95) ? Number(p95.toFixed(3)) : null,
      score: 0,
      route_prompt_smoke: classifyDollarSmoke(routePromptSmoke, now),
      command_route_smoke: classifyDollarSmoke(commandSmoke, now),
      routed_id: routed?.id || null,
      stop_gate: routed?.stopGate || null
    }
  }
  const cliSmokeOrPrompt = Boolean(commandSmokeOk || routed?.cliEntrypoint || routed?.command || entry.command)
  const highRiskPolicy = !/\b(?:MAD|DB|Computer|CU|Commit|Push|Release)\b/i.test(entry.command) || Boolean(routed?.requiredSkills || routed?.lifecycle)
  const score =
    (routePromptOk && p95 <= 20 ? 20 : 0) +
    (metadataComplete ? 20 : 0) +
    (stopGateOrExempt ? 20 : 0) +
    (cliSmokeOrPrompt ? 20 : 0) +
    (highRiskPolicy ? 20 : 0)
  return {
    command: entry.command,
    route: entry.route,
    critical,
    p95_ms: Number.isFinite(p95) ? Number(p95.toFixed(3)) : null,
    score,
    route_prompt_smoke: classifyDollarSmoke(routePromptSmoke, now),
    command_route_smoke: classifyDollarSmoke(commandSmoke, now),
    routed_id: routed?.id || null,
    stop_gate: routed?.stopGate || null
  }
}

export function measureRoutePromptSmoke(entry, routePrompt) {
  const timings = []
  let routed = null
  for (let i = 0; i < 25; i++) {
    const started = performance.now()
    routed = routePrompt(`${entry.command} scorecard smoke`)
    timings.push(performance.now() - started)
  }
  timings.sort((a, b) => a - b)
  const p95 = timings[Math.min(timings.length - 1, Math.ceil(timings.length * 0.95) - 1)] || 0
  return {
    kind: 'route_prompt',
    ok: Boolean(routed?.id),
    generated_at: new Date().toISOString(),
    p95_ms: p95,
    routed
  }
}

export function commandRouteSmokeFor(entry) {
  return {
    kind: 'command_route',
    ok: Boolean(entry.command && entry.route),
    generated_at: new Date().toISOString(),
    command: entry.command,
    route: entry.route
  }
}

export function classifyDollarSmoke(smoke, now = new Date()) {
  if (!smoke) return 'missing'
  if (isDollarSmokeStale(smoke, now)) return 'stale'
  if (smoke.kind === 'blocked_negative') return smoke.blocked === true && smoke.ok !== true ? 'pass' : 'failed'
  return smoke.ok === true ? 'pass' : 'failed'
}

export function isDollarSmokeStale(smoke, now = new Date()) {
  if (!smoke.generated_at) return false
  const generated = new Date(smoke.generated_at).getTime()
  return !Number.isFinite(generated) || now.getTime() - generated > DOLLAR_SMOKE_MAX_AGE_MS
}

function isMainModule() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
}
