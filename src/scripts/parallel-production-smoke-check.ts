#!/usr/bin/env node
import fsp from 'node:fs/promises'
import path from 'node:path'
import { runParallelProductionSmoke } from '../core/agents/parallel-write-fixture.js'

const report = await runParallelProductionSmoke({ injectFailure: true })
const reportPath = path.join(process.cwd(), '.sneakoscope', 'reports', 'parallel-production-smoke.json')
await fsp.mkdir(path.dirname(reportPath), { recursive: true })
await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

if (!report.ok) {
  console.error(JSON.stringify({ ok: false, blockers: report.blockers, reportPath }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({
  ok: true,
  reportPath,
  worker_count: report.worker_count,
  changed_files: report.changed_files,
  patch_envelope_count: report.patch_envelope_count,
  failure_injection: report.failure_injection
}, null, 2))
