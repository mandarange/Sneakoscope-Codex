import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { detectCodex0138Capability } from '../codex-control/codex-0138-capability.js'
import { nowIso, writeJsonAtomic } from '../fsx.js'

export interface Codex0138DoctorReport {
  schema: 'sks.codex-0138-doctor.v1'
  generated_at: string
  ok: boolean
  codex_0138_capability: any
  checks: Record<string, any>
  fixed: string[]
  warnings: string[]
  blockers: string[]
}

export async function runCodex0138Doctor(root: string, input: { fix?: boolean } = {}): Promise<Codex0138DoctorReport> {
  const capability = await detectCodex0138Capability()
  const fixed: string[] = []
  const checks = {
    bash_fallback: await bashFallbackCheck(),
    linux_proxy_socket_path: linuxProxySocketCheck(root),
    oauth_mcp_prerefresh: oauthMcpPrerefreshCheck(capability),
    agents_logical_path: await agentsLogicalPathCheck(root),
    plugin_discovery_cache: await pluginDiscoveryCacheCheck(root, input.fix === true, fixed)
  }
  const warnings = [
    ...(capability.ok ? [] : ['codex_0_138_not_detected']),
    ...Object.values(checks).flatMap((check: any) => Array.isArray(check.warnings) ? check.warnings : [])
  ]
  const blockers = Object.values(checks).flatMap((check: any) => Array.isArray(check.blockers) ? check.blockers : [])
  const report: Codex0138DoctorReport = {
    schema: 'sks.codex-0138-doctor.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    codex_0138_capability: capability,
    checks,
    fixed,
    warnings,
    blockers
  }
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'codex-0138-doctor.json'), report)
  return report
}

async function bashFallbackCheck() {
  const candidates = ['/bin/bash', '/usr/bin/bash']
  const existing = []
  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      existing.push(candidate)
    } catch {}
  }
  return {
    ok: existing.length > 0,
    candidates,
    existing,
    blockers: existing.length ? [] : ['bash_fallback_missing'],
    warnings: []
  }
}

function linuxProxySocketCheck(root: string) {
  if (process.platform !== 'linux') return { ok: true, status: 'not_linux', warnings: [], blockers: [] }
  const candidate = path.join(os.tmpdir(), 'sks-proxy', path.basename(root), 'proxy.sock')
  return {
    ok: candidate.length < 100,
    candidate,
    length: candidate.length,
    warnings: candidate.length < 100 ? [] : ['linux_proxy_socket_path_long'],
    blockers: []
  }
}

function oauthMcpPrerefreshCheck(capability: any) {
  return {
    ok: true,
    supported: capability.supports_oauth_mcp_prerefresh === true,
    warnings: capability.supports_oauth_mcp_prerefresh ? [] : ['oauth_mcp_prerefresh_requires_codex_0_138'],
    blockers: []
  }
}

async function agentsLogicalPathCheck(root: string) {
  const agents = path.join(root, 'AGENTS.md')
  const realRoot = await fs.realpath(root).catch(() => root)
  const exists = await fs.stat(agents).then((st) => st.isFile()).catch(() => false)
  return {
    ok: exists,
    logical_path: agents,
    real_root: realRoot,
    warnings: exists ? [] : ['agents_md_missing_or_unreadable'],
    blockers: []
  }
}

async function pluginDiscoveryCacheCheck(root: string, fix: boolean, fixed: string[]) {
  const cacheDir = path.join(root, '.sneakoscope', 'cache', 'codex-plugin-discovery')
  const exists = await fs.stat(cacheDir).then((st) => st.isDirectory()).catch(() => false)
  if (!exists && fix) {
    await fs.mkdir(cacheDir, { recursive: true })
    await writeJsonAtomic(path.join(cacheDir, 'README.json'), {
      schema: 'sks.codex-plugin-discovery-cache.v1',
      repaired_at: nowIso(),
      purpose: 'Codex 0.138 plugin discovery cache placeholder; safe to refresh from codex plugin list --json.'
    })
    fixed.push('plugin_discovery_cache')
  }
  const after = exists || fix
  return {
    ok: after,
    path: cacheDir,
    warnings: after ? [] : ['plugin_discovery_cache_missing_repair_available'],
    blockers: []
  }
}
