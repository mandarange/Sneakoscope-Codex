#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js'
import fs from 'node:fs'
import path from 'node:path'

const { writePerformanceProfile } = await importDist('core/perf/performance-profiler.js')
const afterProfile = await writePerformanceProfile(root, 'performance-improvement-5.10.0.profile.json')
const baselinePath = path.join(root, '.sneakoscope', 'reports', 'performance-baseline-5.9.0.json')
const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : null
const beforeByName = new Map((baseline?.commands || []).map((row) => [row.name, row]))
const improvements = afterProfile.commands.map((after) => {
  const before = beforeByName.get(after.name)
  const beforeP95 = Number(before?.p95_ms || after.p95_ms)
  const afterP95 = Number(after.p95_ms || 0)
  const improvement = beforeP95 > 0 ? ((beforeP95 - afterP95) / beforeP95) * 100 : 0
  return {
    target: after.name,
    before_p95_ms: beforeP95,
    after_p95_ms: afterP95,
    improvement_percent: Number(improvement.toFixed(2)),
    exit_ok: after.exit_ok,
    evidence: [
      '.sneakoscope/reports/performance-baseline-5.9.0.json',
      '.sneakoscope/reports/performance-improvement-5.10.0.profile.json'
    ]
  }
})
const blockers = [
  ...(afterProfile.blockers || []),
  ...improvements.filter((row) => row.exit_ok !== true).map((row) => `${row.target}:process_failed`)
]
const report = {
  schema: 'sks.performance-improvement.v1',
  ok: blockers.length === 0,
  package_version: afterProfile.package_version,
  git_head: afterProfile.git_head,
  generated_at: new Date().toISOString(),
  baseline_available: Boolean(baseline),
  commands: improvements,
  changed_files: [
    'src/bin/sks.ts',
    'src/cli/command-manifest-lite.ts',
    'src/cli/commands-fast.ts',
    'src/core/perf/performance-profiler.ts',
    'src/core/super-search/doctor.ts',
    'src/core/super-search/local-http-smoke.ts'
  ],
  blockers
}
fs.mkdirSync(path.dirname(baselinePath), { recursive: true })
fs.writeFileSync(path.join(root, '.sneakoscope', 'reports', 'performance-improvement-5.10.0.json'), `${JSON.stringify(report, null, 2)}\n`)

assertGate(report.ok, 'performance_improvement_report_failed', report)
emitGate('perf:improvement-report', {
  commands: report.commands.length,
  slowest_p95_ms: Math.max(...report.commands.map((row) => row.after_p95_ms), 0),
  report_path: '.sneakoscope/reports/performance-improvement-5.10.0.json'
})
