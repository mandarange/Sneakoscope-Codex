#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const reports = path.join(root, '.sneakoscope', 'reports', 'release-gates')
const runs = fs.existsSync(reports)
  ? fs.readdirSync(reports).map((name) => path.join(reports, name, 'summary.json')).filter((file) => fs.existsSync(file))
  : []
const latest = runs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
const summary = latest ? JSON.parse(fs.readFileSync(latest, 'utf8')) : null
console.log(JSON.stringify({
  schema: 'sks.release-speed-summary.v1',
  ok: true,
  report: latest || null,
  selected_gates: summary?.selected_gates || 0,
  skipped_by_affected: summary?.skipped_by_affected?.length || 0,
  cached: summary?.cached || 0,
  executed: summary?.executed_gates?.length || 0,
  wall_ms: summary?.wall_ms || 0,
  cpu_time_saved_ms: summary?.cpu_time_saved_ms || 0,
  parallelism_gain: summary?.parallelism_gain || 0,
  slowest_gates: summary?.slowest_gates || []
}, null, 2))
