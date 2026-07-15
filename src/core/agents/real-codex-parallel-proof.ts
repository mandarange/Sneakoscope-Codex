import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { OFFICIAL_SUBAGENT_EXECUTION_AUTHORITY } from '../proof/fake-real-proof-policy.js'

export const REAL_CODEX_PARALLEL_PROOF_SCHEMA = 'sks.real-codex-parallel-proof.v1'

export async function writeRealCodexParallelProof(root: string, opts: {
  requestedWorkers?: number
  required?: boolean
  writeArtifacts?: boolean
} = {}) {
  const proof = await buildRealCodexParallelProof(root, opts)
  if (opts.writeArtifacts !== false) await writeJsonAtomic(path.join(root, 'real-codex-parallel-proof.json'), proof)
  return proof
}

export async function buildRealCodexParallelProof(root: string, opts: {
  requestedWorkers?: number
  required?: boolean
} = {}) {
  const runtime = await readJson<any>(path.join(root, 'native-cli-worker-runtime.json'), null)
  const workerDirs: string[] = Array.isArray(runtime?.worker_artifact_dirs) ? runtime.worker_artifact_dirs.map(String) : []
  const routerReports = await readReports(root, workerDirs, 'worker-backend-router-report.json')
  const codexReports = await readReports(root, workerDirs, 'codex-worker-process-report.json')
  const sdkProofs = await readReports(root, workerDirs, 'codex-control-proof.json')
  const outputTruths = await readReports(root, workerDirs, 'codex-worker-output-truth.json')
  const requestedWorkers = Number(opts.requestedWorkers || runtime?.requested_agents || runtime?.target_active_slots || routerReports.length || 0)
  const required = opts.required === true || process.env.SKS_REQUIRE_REAL_CODEX_PARALLEL === '1'
  const nativeProcessIds = uniqueNumbers([...(Array.isArray(runtime?.process_ids) ? runtime.process_ids : []), ...routerReports.map((row) => row.worker_process_id)])
  const codexChildProcessIds = uniqueNumbers([
    ...routerReports.flatMap((row) => Array.isArray(row.child_process_ids) ? row.child_process_ids : []),
    ...codexReports.map((row) => row.codex_child_pid)
  ])
  const windows = codexReports
    .filter((row) => Number.isFinite(Number(row.codex_child_pid)) && row.codex_child_started_at && row.codex_child_finished_at)
    .map((row) => ({
      pid: Number(row.codex_child_pid),
      started_at: String(row.codex_child_started_at),
      finished_at: String(row.codex_child_finished_at)
    }))
  const maxOverlap = maxWindowOverlap(windows)
  const sdkThreadIds = uniqueStrings([
    ...routerReports.map((row) => row.sdk_thread_id),
    ...sdkProofs.map((row) => row.sdk_thread_id)
  ])
  const sdkStructuredOutputCount = sdkProofs.filter((row) => row.structured_output_valid === true).length
  const sdkEventStreamCount = sdkProofs.reduce((sum, row) => sum + Number(row.stream_event_count || 0), 0)
  const observedParallel = Math.max(maxOverlap, sdkThreadIds.length)
  const outputLastMessageCount = codexReports.filter((row) => row.output_last_message_path).length
  const modelAuthoredPatchCount = routerReports.reduce((sum, row) => sum + (row.model_authored_patch_envelopes ? Number(row.patch_envelope_count || 0) : 0), 0)
  const fixturePatchCount = routerReports.reduce((sum, row) => sum + (row.fixture_patch_envelopes ? Number(row.patch_envelope_count || 0) : 0), 0)
  const syntheticFallbackCount = codexReports.filter((row) => row.synthetic_stdout_fallback === true).length
  const fastModeMissing = codexReports.length ? codexReports.filter((row) => row.fast_mode !== true) : []
  const enoughWork = requestedWorkers > 0 && workerDirs.length >= requestedWorkers
  const realCodexExecuted = (codexChildProcessIds.length > 0 && windows.length > 0) || sdkThreadIds.length > 0
  const blockers = [
    ...(!runtime ? ['native_cli_worker_runtime_missing'] : []),
    ...(required && !realCodexExecuted ? ['real_codex_sdk_threads_missing'] : []),
    ...(required && enoughWork && observedParallel < requestedWorkers ? [`codex_sdk_parallelism_below_requested:${observedParallel}/${requestedWorkers}`] : []),
    ...(required && outputLastMessageCount === 0 && sdkStructuredOutputCount < Math.min(requestedWorkers, sdkProofs.length || requestedWorkers) ? ['codex_structured_output_missing'] : []),
    ...(required && modelAuthoredPatchCount === 0 ? ['model_authored_patch_envelopes_missing'] : []),
    ...(required && modelAuthoredPatchCount > 0 && modelAuthoredPatchCount < requestedWorkers ? [`model_authored_patch_envelopes_below_requested:${modelAuthoredPatchCount}/${requestedWorkers}`] : []),
    ...(syntheticFallbackCount > 0 ? ['synthetic_stdout_fallback_present'] : []),
    ...(fastModeMissing.length ? ['codex_child_fast_mode_missing'] : [])
  ]
  const integrationOptional = !required && !realCodexExecuted
  return {
    schema: REAL_CODEX_PARALLEL_PROOF_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    status: blockers.length ? 'blocked' : integrationOptional ? 'integration_optional' : 'passed',
    proof_level: integrationOptional ? 'integration_optional' : blockers.length ? 'blocked' : 'proven',
    required,
    requested_workers: requestedWorkers,
    enough_work: enoughWork,
    native_worker_process_count: nativeProcessIds.length,
    native_worker_process_ids: nativeProcessIds,
    codex_child_process_count: codexChildProcessIds.length,
    codex_child_process_ids: codexChildProcessIds,
    max_observed_codex_child_process_overlap: maxOverlap,
    codex_child_windows: windows,
    sdk_thread_count: sdkThreadIds.length,
    sdk_thread_ids: sdkThreadIds,
    sdk_structured_output_count: sdkStructuredOutputCount,
    sdk_event_stream_count: sdkEventStreamCount,
    max_observed_codex_sdk_parallelism: observedParallel,
    output_last_message_count: outputLastMessageCount,
    output_truth_count: outputTruths.length,
    model_authored_patch_envelope_count: modelAuthoredPatchCount,
    fixture_patch_envelope_count: fixturePatchCount,
    synthetic_stdout_fallback_count: syntheticFallbackCount,
    fast_mode_child_propagation_ok: fastModeMissing.length === 0,
    router_report_count: routerReports.length,
    codex_worker_process_report_count: codexReports.length,
    execution_authority: OFFICIAL_SUBAGENT_EXECUTION_AUTHORITY,
    evidence_role: 'supporting',
    proof_scope: 'supporting_runtime_signals',
    runtime_truth_links: [OFFICIAL_SUBAGENT_EXECUTION_AUTHORITY],
    supporting_runtime_signals: ['codex_sdk_threads', 'codex_sdk_event_stream', 'model_authored_patch_envelopes', 'fast_mode_child_propagation'],
    blockers
  }
}

async function readReports(root: string, dirs: string[], name: string) {
  const reports: any[] = []
  for (const dir of dirs) {
    const report = await readJson<any>(path.join(root, dir, name), null)
    if (report) reports.push(report)
  }
  return reports
}

function uniqueNumbers(values: any[]) {
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isFinite(value)))].sort((a, b) => a - b)
}

function uniqueStrings(values: any[]) {
  return [...new Set(values.map((value) => String(value || '')).filter(Boolean))].sort()
}

function maxWindowOverlap(windows: { started_at: string; finished_at: string }[]) {
  const points: { t: number; delta: number }[] = []
  for (const win of windows) {
    const start = Date.parse(win.started_at)
    const end = Date.parse(win.finished_at)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    points.push({ t: start, delta: 1 }, { t: Math.max(start, end), delta: -1 })
  }
  points.sort((a, b) => a.t - b.t || b.delta - a.delta)
  let current = 0
  let max = 0
  for (const point of points) {
    current += point.delta
    max = Math.max(max, current)
  }
  return max
}
