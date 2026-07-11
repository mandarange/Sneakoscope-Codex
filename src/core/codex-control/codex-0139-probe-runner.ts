import fs from 'node:fs/promises'
import path from 'node:path'
import { findCodexBinary } from '../codex-adapter.js'
import { parseCodexVersionText } from '../codex-compat/codex-version-policy.js'
import { CURRENT_CODEX_RELEASE_MANIFEST } from '../codex-compat/codex-release-manifest.js'
import { runProcess } from '../fsx.js'
import { runCodex0139DoctorEnvRealProbe } from './codex-0139-doctor-real-probe.js'
import { runCodex0139ImageReferencedPathRealProbe } from './codex-0139-image-path-real-probe.js'
import { runCodex0144CollabAgentToolSchemaRealProbe } from './codex-0144-collab-agent-real-probe.js'
import { runCodex0139MarketplaceSourceRealProbe, runCodex0139PluginCacheRealProbe } from './codex-0139-plugin-real-probes.js'
import { buildCodex0139RealProbeResult, CODEX_0139_REAL_PROBE_NAMES, skippedCodex0139Probe, type Codex0139ProbeName, type Codex0139RealProbeResult, type Codex0139SingleProbe } from './codex-0139-real-probes.js'
import { runCodex0139RichSchemaRealProbe } from './codex-0139-rich-schema-real-probe.js'
import { runCodex0139SandboxProfileAliasProbe, runCodex0139SandboxProxyPreservationProbe } from './codex-0139-sandbox-real-probe.js'
import { runCodex0139WebSearchRealProbe } from './codex-0139-web-search-probe.js'

export async function runCodex0139RealProbes(input: {
  root: string
  missionId?: string | null
  codexBin?: string | null
  requireReal?: boolean
  timeoutMs?: number
  probes?: string[]
  allowNetwork?: boolean
  allowDesktop?: boolean
}): Promise<Codex0139RealProbeResult> {
  const timeoutMs = Math.max(1, Number(input.timeoutMs || 120000) || 120000)
  const requireReal = input.requireReal === true
  const codexBin = input.codexBin || await findCurrentCodexRealProbeBinary()
  const versionText = await readCodexVersionText(codexBin, timeoutMs)
  const parsedVersion = parseCodexVersionText(versionText)
  const currentVersion = parsedVersion === CURRENT_CODEX_RELEASE_MANIFEST.requiredCliVersion
  const requestedRaw = input.probes?.length ? input.probes : CODEX_0139_REAL_PROBE_NAMES
  const unknownProbeNames = requestedRaw.filter((name) => !(CODEX_0139_REAL_PROBE_NAMES as string[]).includes(name))
  const requested = [...new Set(requestedRaw.filter((name): name is Codex0139ProbeName => (CODEX_0139_REAL_PROBE_NAMES as string[]).includes(name)))]
  const probes = Object.fromEntries(CODEX_0139_REAL_PROBE_NAMES.map((name) => [name, skippedCodex0139Probe('probe_not_requested')])) as Record<Codex0139ProbeName, Codex0139SingleProbe>
  const extraBlockers: string[] = unknownProbeNames.map((name) => `unknown_real_probe:${name}`)
  if (!codexBin) extraBlockers.push('codex_cli_missing')
  if (!currentVersion) extraBlockers.push(`codex_${CURRENT_CODEX_RELEASE_MANIFEST.requiredCliVersion.replaceAll('.', '_')}_required`)

  if (!codexBin || !currentVersion) {
    for (const name of requested) {
      probes[name] = skippedCodex0139Probe(!codexBin ? 'codex_cli_missing' : 'codex_current_release_required', { parsed_version: parsedVersion })
    }
    const tempCleanup = await cleanupProbeTempRoot(input.root)
    return buildCodex0139RealProbeResult({ codexBin, versionText, parsedVersion, requireReal, timeoutMs, probes, requiredProbeNames: requested, releaseAuthorizing: false, tempCleanup, extraBlockers })
  }

  let rows: ReadonlyArray<readonly [Codex0139ProbeName, Codex0139SingleProbe]> = []
  let tempCleanup: { root: string; ok: boolean; remaining_entries: string[] }
  try {
    rows = await Promise.all(requested.map(async (name) => {
      try {
        const probe = await runOne(name, {
          root: input.root,
          requireReal,
          timeoutMs,
          codexBin,
          allowNetwork: input.allowNetwork,
          allowDesktop: input.allowDesktop
        })
        return [name, surfaceRuntimeWarnings(probe)] as const
      } catch (err: unknown) {
        const errorClass = err instanceof Error ? err.name : typeof err
        extraBlockers.push(`codex_real_probe_runner_failed:${name}`)
        return [name, skippedCodex0139Probe('codex_real_probe_runner_failed', { error_class: errorClass })] as const
      }
    }))
  } finally {
    tempCleanup = await cleanupProbeTempRoot(input.root)
  }
  for (const [name, probe] of rows) probes[name] = probe
  sanitizeCleanedTempArtifacts(probes, input.root)
  if (!tempCleanup.ok) extraBlockers.push('codex_real_probe_temp_cleanup_failed')
  return buildCodex0139RealProbeResult({
    codexBin,
    versionText,
    parsedVersion,
    requireReal,
    timeoutMs,
    probes,
    requiredProbeNames: requested,
    releaseAuthorizing: requireReal && currentVersion,
    tempCleanup,
    extraBlockers
  })
}

async function runOne(name: Codex0139ProbeName, input: any): Promise<Codex0139SingleProbe> {
  switch (name) {
    case 'code_mode_web_search':
      return runCodex0139WebSearchRealProbe(input)
    case 'rich_tool_schema':
      return runCodex0139RichSchemaRealProbe(input)
    case 'doctor_env_redaction':
      return runCodex0139DoctorEnvRealProbe(input)
    case 'marketplace_source_json':
      return runCodex0139MarketplaceSourceRealProbe(input)
    case 'plugin_catalog_cache':
      return runCodex0139PluginCacheRealProbe(input)
    case 'sandbox_profile_alias':
      return runCodex0139SandboxProfileAliasProbe(input)
    case 'collab_agent_tool_schema':
      return runCodex0144CollabAgentToolSchemaRealProbe(input)
    case 'image_referenced_path':
      return runCodex0139ImageReferencedPathRealProbe(input)
    case 'sandbox_proxy_environment':
      return runCodex0139SandboxProxyPreservationProbe(input)
  }
}

async function readCodexVersionText(codexBin: string | null, timeoutMs: number): Promise<string | null> {
  if (!codexBin) return null
  const result = await runProcess(codexBin, ['--version'], { timeoutMs: Math.min(timeoutMs, 30000), maxOutputBytes: 16 * 1024 }).catch((err: any) => ({
    code: 1,
    stdout: '',
    stderr: err?.message || String(err)
  }))
  const text = `${(result as any).stdout || ''}${(result as any).stderr || ''}`.trim()
  return text || null
}

export async function findCurrentCodexRealProbeBinary(): Promise<string | null> {
  const candidates = await codexBinaryCandidates()
  let firstExisting: string | null = null
  for (const candidate of candidates) {
    if (!firstExisting) firstExisting = candidate
    const versionText = await readCodexVersionText(candidate, 30000)
    const parsed = parseCodexVersionText(versionText)
    if (parsed === CURRENT_CODEX_RELEASE_MANIFEST.requiredCliVersion) return candidate
  }
  return firstExisting || await findCodexBinary()
}

async function codexBinaryCandidates(): Promise<string[]> {
  const raw = [
    path.join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'codex.cmd' : 'codex'),
    process.env.SKS_CODEX_BIN,
    process.env.DCODEX_CODEX_BIN,
    process.env.CODEX_BIN,
    ...pathCandidates('codex')
  ].filter(Boolean).map(String)
  const out: string[] = []
  for (const candidate of raw) {
    if (out.includes(candidate)) continue
    try {
      const st = await fs.stat(candidate)
      if (st.isFile()) out.push(candidate)
    } catch {}
  }
  return out
}

function surfaceRuntimeWarnings(probe: Codex0139SingleProbe): Codex0139SingleProbe {
  const warnings = [...(probe.warnings || [])]
  const blockers = [...probe.blockers]
  const stderr = String(probe.stderr_tail || '')
  if (/AuthRequired|Auth required|No access token was provided/i.test(stderr)) {
    warnings.push('codex_real_probe_external_mcp_auth_required')
  }
  if (probe.evidence?.process_warning) warnings.push('codex_real_probe_process_warning')
  return {
    ...probe,
    ok: probe.ok && blockers.length === 0,
    warnings: [...new Set(warnings)],
    blockers: [...new Set(blockers)]
  }
}

async function cleanupProbeTempRoot(root: string) {
  const tempRoot = path.join(root, '.sneakoscope', 'tmp', 'codex-0139-real-probes')
  await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
  const remainingEntries = await fs.readdir(tempRoot).catch(() => [])
  return { root: tempRoot, ok: remainingEntries.length === 0, remaining_entries: remainingEntries }
}

function sanitizeCleanedTempArtifacts(probes: Record<Codex0139ProbeName, Codex0139SingleProbe>, root: string) {
  const tempRoot = path.resolve(root, '.sneakoscope', 'tmp', 'codex-0139-real-probes')
  for (const probe of Object.values(probes)) {
    const tempArtifacts = probe.artifact_paths.filter((artifact) => {
      const resolved = path.resolve(artifact)
      return resolved === tempRoot || resolved.startsWith(`${tempRoot}${path.sep}`)
    })
    if (!tempArtifacts.length) continue
    probe.artifact_paths = probe.artifact_paths.filter((artifact) => !tempArtifacts.includes(artifact))
    probe.evidence = {
      ...probe.evidence,
      observed_temp_artifact_count: tempArtifacts.length,
      temp_artifacts_cleaned: true,
      durable_evidence: 'embedded_in_codex_real_probe_report'
    }
  }
}

function pathCandidates(command: string): string[] {
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : ['']
  return (process.env.PATH || '').split(path.delimiter).flatMap((dir) => exts.map((ext) => path.join(dir, `${command}${ext}`)))
}
