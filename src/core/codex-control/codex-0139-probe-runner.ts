import fs from 'node:fs/promises'
import path from 'node:path'
import { findCodexBinary } from '../codex-adapter.js'
import { compareSemverLike, parseCodexVersionText } from '../codex-compat/codex-version-policy.js'
import { runProcess } from '../fsx.js'
import { runCodex0139DoctorEnvRealProbe } from './codex-0139-doctor-real-probe.js'
import { runCodex0139ImageReferencedPathRealProbe } from './codex-0139-image-path-real-probe.js'
import { runCodex0139InterruptAgentRealProbe } from './codex-0139-multi-agent-real-probe.js'
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
  const codexBin = input.codexBin || await findCodex0139RealProbeBinary()
  const versionText = await readCodexVersionText(codexBin, timeoutMs)
  const parsedVersion = parseCodexVersionText(versionText)
  const atLeast139 = Boolean(parsedVersion && compareSemverLike(parsedVersion, '0.139.0') >= 0)
  const requested = new Set((input.probes?.length ? input.probes : CODEX_0139_REAL_PROBE_NAMES).filter((name): name is Codex0139ProbeName => (CODEX_0139_REAL_PROBE_NAMES as string[]).includes(name)))
  const probes = Object.fromEntries(CODEX_0139_REAL_PROBE_NAMES.map((name) => [name, skippedCodex0139Probe('probe_not_requested')])) as Record<Codex0139ProbeName, Codex0139SingleProbe>
  const extraBlockers: string[] = []
  if (!codexBin) extraBlockers.push('codex_cli_missing')
  if (!atLeast139) extraBlockers.push('codex_0_139_required')

  if (!codexBin || !atLeast139) {
    for (const name of requested) {
      probes[name] = skippedCodex0139Probe(!codexBin ? 'codex_cli_missing' : 'codex_0_139_required', { parsed_version: parsedVersion })
    }
    return buildCodex0139RealProbeResult({ codexBin, versionText, parsedVersion, requireReal, timeoutMs, probes, extraBlockers })
  }

  for (const name of requested) {
    probes[name] = await runOne(name, {
      root: input.root,
      requireReal,
      timeoutMs,
      codexBin,
      allowNetwork: input.allowNetwork,
      allowDesktop: input.allowDesktop
    })
  }
  return buildCodex0139RealProbeResult({ codexBin, versionText, parsedVersion, requireReal, timeoutMs, probes, extraBlockers })
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
    case 'interrupt_agent_event':
      return runCodex0139InterruptAgentRealProbe(input)
    case 'image_referenced_path':
      return runCodex0139ImageReferencedPathRealProbe(input)
    case 'sandbox_proxy_preservation':
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

export async function findCodex0139RealProbeBinary(): Promise<string | null> {
  const candidates = await codexBinaryCandidates()
  let firstExisting: string | null = null
  for (const candidate of candidates) {
    if (!firstExisting) firstExisting = candidate
    const versionText = await readCodexVersionText(candidate, 30000)
    const parsed = parseCodexVersionText(versionText)
    if (parsed && compareSemverLike(parsed, '0.139.0') >= 0) return candidate
  }
  return firstExisting || await findCodexBinary()
}

async function codexBinaryCandidates(): Promise<string[]> {
  const raw = [
    process.env.SKS_CODEX_BIN,
    process.env.DCODEX_CODEX_BIN,
    process.env.CODEX_BIN,
    ...pathCandidates('codex'),
    path.join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'codex.cmd' : 'codex')
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

function pathCandidates(command: string): string[] {
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : ['']
  return (process.env.PATH || '').split(path.delimiter).flatMap((dir) => exts.map((ext) => path.join(dir, `${command}${ext}`)))
}
