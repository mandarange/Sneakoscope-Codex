import path from 'node:path'
import { codex0139ProbeArtifactPath, type Codex0139RealProbeResult } from './codex-0139-real-probes.js'
import { readJson, writeJsonAtomic } from '../fsx.js'

export interface Codex0139RealProbeSummary {
  schema: 'sks.codex-0139-real-probe-summary.v1'
  ok: boolean
  require_real: boolean
  codex_bin: string | null
  parsed_version: string | null
  actual_cli_probe_count: number
  actual_sdk_probe_count: number
  actual_app_server_probe_count: number
  actual_sks_bridge_probe_count: number
  skipped_count: number
  failed_count: number
  probes: Record<string, {
    ok: boolean
    mode: string
    blockers: string[]
  }>
}

export async function buildCodex0139RealProbeSummary(root: string): Promise<Codex0139RealProbeSummary> {
  const result = await readJson<Codex0139RealProbeResult>(codex0139ProbeArtifactPath(root))
  const probes = Object.fromEntries(Object.entries(result.probes || {}).map(([name, probe]) => [name, {
    ok: probe.ok === true,
    mode: probe.mode,
    blockers: probe.blockers || []
  }]))
  const values = Object.values(result.probes || {})
  const skippedCount = values.filter((probe) => probe.mode === 'skipped').length
  const failedCount = values.filter((probe) => probe.ok !== true && probe.mode !== 'skipped').length
  return {
    schema: 'sks.codex-0139-real-probe-summary.v1',
    ok: result.require_real ? skippedCount === 0 && failedCount === 0 : result.overall_ok === true,
    require_real: result.require_real,
    codex_bin: result.codex_bin,
    parsed_version: result.parsed_version,
    actual_cli_probe_count: values.filter((probe) => probe.mode === 'actual-cli').length,
    actual_sdk_probe_count: values.filter((probe) => probe.mode === 'actual-sdk').length,
    actual_app_server_probe_count: values.filter((probe) => probe.mode === 'actual-app-server').length,
    actual_sks_bridge_probe_count: values.filter((probe) => probe.mode === 'actual-sks-bridge').length,
    skipped_count: skippedCount,
    failed_count: failedCount,
    probes
  }
}

export async function writeCodex0139RealProbeSummary(root: string) {
  const summary = await buildCodex0139RealProbeSummary(root)
  const rootArtifact = path.join(root, '.sneakoscope', 'codex-0139-real-probe-summary.json')
  const distArtifact = path.join(root, 'dist', 'codex-0139-real-probe-summary.json')
  await writeJsonAtomic(rootArtifact, summary)
  await writeJsonAtomic(distArtifact, summary)
  return { summary, root_artifact: rootArtifact, dist_artifact: distArtifact }
}
