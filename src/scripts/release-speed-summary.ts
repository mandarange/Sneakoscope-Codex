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
const mode = summary?.affected_selection?.mode || summary?.selected_preset || (summary?.full === true ? 'full' : 'unknown')
const affectedMode = mode === 'affected'
const latestRuntimeProof = latestRuntimeProofSummaryPath()
console.log(JSON.stringify({
  schema: 'sks.release-speed-summary.v1',
  ok: true,
  report: latest || null,
  mode,
  affected_mode: affectedMode,
  affected_mode_warning: affectedMode ? 'Affected mode: true. This is not a full publish gate. Run npm run release:check:full before publishing.' : null,
  selected_gates: summary?.selected_gates || 0,
  selected_gate_ids: summary?.selected_gate_ids || [],
  skipped_by_affected: summary?.skipped_by_affected?.length || 0,
  skipped_gate_ids: summary?.skipped_by_affected || [],
  cached: summary?.cached || 0,
  cached_gates: summary?.cached_gates || [],
  executed: summary?.executed_gates?.length || 0,
  executed_gates: summary?.executed_gates || [],
  wall_ms: summary?.wall_ms || 0,
  cpu_time_saved_ms: summary?.cpu_time_saved_ms || 0,
  parallelism_gain: summary?.parallelism_gain || 0,
  max_running: summary?.peak_running || summary?.max_running || 0,
  slowest_gates: summary?.slowest_gates || [],
  proof_file_path: latestRuntimeProof
}, null, 2))

function latestRuntimeProofSummaryPath() {
  const missions = path.join(root, '.sneakoscope', 'missions')
  if (!fs.existsSync(missions)) return null
  const files = fs.readdirSync(missions)
    .map((name) => path.join(missions, name, 'agents', 'runtime-proof-summary.json'))
    .filter((file) => fs.existsSync(file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  return files[0] || null
}
