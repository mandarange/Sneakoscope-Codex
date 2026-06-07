#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'

const latest = latestDagSummary()
assertGate(Boolean(latest), 'release speed budget requires an actual DAG summary', {
  expected: '.sneakoscope/reports/release-gates/<latest>/summary.json',
  hint: 'run npm run release:check:dag first'
})
const summary = JSON.parse(fs.readFileSync(latest.summaryPath, 'utf8'))
const slowest = slowestGateResults(latest.dir)
const warnOnly = process.env.SKS_RELEASE_SPEED_BUDGET_WARN_ONLY === '1'
const budgetMs = Number(process.env.SKS_RELEASE_SPEED_BUDGET_MS || 20 * 60 * 1000)
const cachedBudgetMs = Number(process.env.SKS_RELEASE_CACHED_SPEED_BUDGET_MS || 4 * 60 * 1000)
const cachedRatio = Number(summary.cached || 0) / Math.max(1, Number(summary.completed || summary.selected_gates || 1))
const cachedRun = cachedRatio >= 0.5
const parallelismOk = cachedRun || summary.parallelism_gain >= 2
const wallOk = cachedRun ? summary.wall_ms <= cachedBudgetMs : summary.wall_ms <= budgetMs
const failureIds = Array.isArray(summary.failures) ? summary.failures.map((entry) => String(entry?.id || '')).filter(Boolean) : []
const selfFailureIds = new Set(['release:parallel-speed-budget', 'release:stability-report'])
const blockingFailureIds = failureIds.filter((id) => !selfFailureIds.has(id))
const summaryOk = Number(summary.failed || 0) === 0 || (failureIds.length > 0 && blockingFailureIds.length === 0)
const report = {
  schema: 'sks.release-speed.v1',
  ok: summaryOk && parallelismOk && (wallOk || warnOnly),
  summary_path: path.relative(root, latest.summaryPath),
  run_id: summary.run_id,
  mode: cachedRun ? 'cached' : 'full',
  total_gates: summary.total_gates,
  selected_gates: summary.selected_gates,
  completed: summary.completed,
  failed: summary.failed,
  cached: summary.cached,
  cached_ratio: Number(cachedRatio.toFixed(4)),
  wall_ms: summary.wall_ms,
  sum_gate_ms: summary.sum_gate_ms,
  critical_path_ms: summary.critical_path_ms,
  slowest_gates: slowest,
  functional_failure_ids: blockingFailureIds,
  ignored_self_failure_ids: failureIds.filter((id) => selfFailureIds.has(id)),
  target_full_wall_ms: budgetMs,
  target_cached_wall_ms: cachedBudgetMs,
  target_changed_file_wall_ms: 90 * 1000,
  parallelism_gain: summary.parallelism_gain,
  warn_only: warnOnly,
  blockers: [
    ...(summaryOk ? [] : ['release_summary_has_failures']),
    ...(parallelismOk ? [] : ['parallelism_gain_below_2']),
    ...(wallOk || warnOnly ? [] : [cachedRun ? 'cached_release_wall_budget_exceeded' : 'release_wall_budget_exceeded']),
    ...(Number.isFinite(Number(summary.critical_path_ms)) ? [] : ['critical_path_ms_missing']),
    ...(Array.isArray(slowest) && slowest.length ? [] : ['slowest_gates_missing'])
  ]
}
assertGate(report.blockers.length === 0, 'release DAG speed budget must use and pass actual run summary', report)
fs.mkdirSync(path.join(root, '.sneakoscope', 'reports'), { recursive: true })
fs.writeFileSync(path.join(root, '.sneakoscope', 'reports', 'release-parallel-speed-budget.json'), `${JSON.stringify(report, null, 2)}\n`)
emitGate('release:parallel-speed-budget', report)

function latestDagSummary() {
  const dir = path.join(root, '.sneakoscope', 'reports', 'release-gates')
  if (!fs.existsSync(dir)) return null
  const rows = fs.readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((candidate) => fs.existsSync(path.join(candidate, 'summary.json')))
    .map((candidate) => ({ dir: candidate, summaryPath: path.join(candidate, 'summary.json'), mtime: fs.statSync(path.join(candidate, 'summary.json')).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  return rows[0] || null
}

function slowestGateResults(reportDir: string) {
  const out = []
  for (const name of fs.readdirSync(reportDir)) {
    const file = path.join(reportDir, name, 'result.json')
    if (!fs.existsSync(file)) continue
    try {
      const result = JSON.parse(fs.readFileSync(file, 'utf8'))
      out.push({ id: result.id || name, duration_ms: Number(result.duration_ms || 0), cached: result.cached === true, ok: result.ok === true })
    } catch {}
  }
  return out.sort((a, b) => b.duration_ms - a.duration_ms).slice(0, 10)
}
