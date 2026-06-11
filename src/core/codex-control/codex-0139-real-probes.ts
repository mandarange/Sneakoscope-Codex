import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'

export type Codex0139ProbeName =
  | 'code_mode_web_search'
  | 'rich_tool_schema'
  | 'doctor_env_redaction'
  | 'marketplace_source_json'
  | 'plugin_catalog_cache'
  | 'sandbox_profile_alias'
  | 'interrupt_agent_event'
  | 'image_referenced_path'
  | 'sandbox_proxy_preservation'

export const CODEX_0139_REAL_PROBE_NAMES: Codex0139ProbeName[] = [
  'code_mode_web_search',
  'rich_tool_schema',
  'doctor_env_redaction',
  'marketplace_source_json',
  'plugin_catalog_cache',
  'sandbox_profile_alias',
  'interrupt_agent_event',
  'image_referenced_path',
  'sandbox_proxy_preservation'
]

export interface Codex0139RealProbeResult {
  schema: 'sks.codex-0139-real-probe-result.v1'
  generated_at: string
  codex_bin: string | null
  version_text: string | null
  parsed_version: string | null
  require_real: boolean
  overall_ok: boolean
  probe_timeout_ms: number
  probes: Record<Codex0139ProbeName, Codex0139SingleProbe>
  skipped: string[]
  blockers: string[]
}

export interface Codex0139SingleProbe {
  ok: boolean
  mode: 'actual-cli' | 'actual-sdk' | 'actual-app-server' | 'actual-sks-bridge' | 'captured-real-fixture' | 'skipped'
  command_line?: string[]
  duration_ms: number
  stdout_tail?: string
  stderr_tail?: string
  artifact_paths: string[]
  evidence: Record<string, unknown>
  blockers: string[]
}

export function codex0139ProbeArtifactPath(root: string): string {
  return path.join(root, '.sneakoscope', 'codex-0139-real-probes.json')
}

export function codex0139MissionProbeArtifactPath(root: string, missionId: string): string {
  return path.join(root, '.sneakoscope', 'missions', missionId, 'codex-0139-real-probes.json')
}

export function codex0139DistProbeArtifactPath(root: string): string {
  return path.join(root, 'dist', 'codex-0139-real-probes.json')
}

export async function writeCodex0139RealProbeResult(
  root: string,
  result: Codex0139RealProbeResult,
  opts: { missionId?: string | null; writeDist?: boolean } = {}
) {
  const rootArtifact = codex0139ProbeArtifactPath(root)
  await writeJsonAtomic(rootArtifact, result)
  let missionArtifact: string | null = null
  if (opts.missionId) {
    missionArtifact = codex0139MissionProbeArtifactPath(root, opts.missionId)
    await writeJsonAtomic(missionArtifact, result)
  }
  let distArtifact: string | null = null
  if (opts.writeDist !== false) {
    distArtifact = codex0139DistProbeArtifactPath(root)
    await writeJsonAtomic(distArtifact, result)
  }
  return { root_artifact: rootArtifact, mission_artifact: missionArtifact, dist_artifact: distArtifact }
}

export function skippedCodex0139Probe(blocker: string, evidence: Record<string, unknown> = {}): Codex0139SingleProbe {
  return {
    ok: false,
    mode: 'skipped',
    duration_ms: 0,
    artifact_paths: [],
    evidence,
    blockers: [blocker]
  }
}

export function codex0139ProbeTail(text: unknown, limit = 4000): string {
  const raw = String(text || '')
  return raw.length <= limit ? raw : raw.slice(raw.length - limit)
}

export function buildCodex0139RealProbeResult(input: {
  codexBin: string | null
  versionText: string | null
  parsedVersion: string | null
  requireReal: boolean
  timeoutMs: number
  probes: Record<Codex0139ProbeName, Codex0139SingleProbe>
  extraBlockers?: string[]
}): Codex0139RealProbeResult {
  const skipped = CODEX_0139_REAL_PROBE_NAMES.filter((name) => input.probes[name]?.mode === 'skipped')
  const failed = CODEX_0139_REAL_PROBE_NAMES.filter((name) => input.probes[name] && input.probes[name].ok !== true && input.probes[name].mode !== 'skipped')
  const blockers = [
    ...(input.extraBlockers || []),
    ...CODEX_0139_REAL_PROBE_NAMES.flatMap((name) => input.probes[name]?.blockers || []),
    ...(input.requireReal && skipped.length ? skipped.map((name) => `require_real_skipped:${name}`) : [])
  ]
  return {
    schema: 'sks.codex-0139-real-probe-result.v1',
    generated_at: nowIso(),
    codex_bin: input.codexBin,
    version_text: input.versionText,
    parsed_version: input.parsedVersion,
    require_real: input.requireReal,
    overall_ok: input.requireReal ? blockers.length === 0 && failed.length === 0 && skipped.length === 0 : failed.length === 0,
    probe_timeout_ms: input.timeoutMs,
    probes: input.probes,
    skipped,
    blockers: [...new Set(blockers)]
  }
}
