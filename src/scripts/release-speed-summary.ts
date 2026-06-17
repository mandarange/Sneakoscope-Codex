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
const certificatePath = latest ? path.join(path.dirname(latest), 'completion-certificate.json') : null
const certificate = certificatePath && fs.existsSync(certificatePath) ? JSON.parse(fs.readFileSync(certificatePath, 'utf8')) : summary?.completion_certificate || null
const affectedGraphPath = latest ? path.join(path.dirname(latest), 'affected-gate-graph.json') : null
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
  proof_bank_file: certificate?.proof_bank_file || path.join(root, '.sneakoscope', 'proof-bank', 'gates', 'cache-v2.json'),
  completion_certificate: certificate,
  affected_graph_file: affectedGraphPath && fs.existsSync(affectedGraphPath) ? affectedGraphPath : null,
  reused_proofs: certificate?.reused_proofs || summary?.cached || 0,
  newly_executed_gates: certificate?.newly_executed_gates || summary?.executed_gates?.length || 0,
  five_minute_sla_met: certificate?.sla_met ?? null,
  version_neutralized_inputs: [
    'package.json:version',
    'package-lock.json:root.version',
    'src/core/version.ts:PACKAGE_VERSION',
    'src/core/fsx.ts:PACKAGE_VERSION',
    'src/bin/sks.ts:FAST_PACKAGE_VERSION',
    'dist/build-manifest.json:version'
  ],
  behavior_affecting_inputs: [],
  cache_key_policy: 'version-neutral-safe-v1',
  cache_message: 'Release cache: version-only changes neutralized for behavior gates. Version correctness gates still ran uncached.',
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
