import fs from 'node:fs/promises'
import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export const FAST_MODE_POLICY_SCHEMA = 'sks.fast-mode-policy.v1'
export const FAST_MODE_PROPAGATION_PROOF_SCHEMA = 'sks.fast-mode-propagation-proof.v1'
export type AgentServiceTier = 'fast' | 'standard'

export interface FastModePolicy {
  schema: typeof FAST_MODE_POLICY_SCHEMA
  generated_at: string
  fast_mode: boolean
  service_tier: AgentServiceTier
  default_fast_mode: true
  disabled_by: 'none' | 'no-fast' | 'service-tier-standard'
  explicit_fast: boolean
  explicit_no_fast: boolean
  explicit_service_tier: AgentServiceTier | null
}

export function resolveFastModePolicy(input: any = {}): FastModePolicy {
  const explicitTier = normalizeServiceTier(input.serviceTier ?? input.service_tier, null)
  const explicitNoFast = input.fastMode === false || input.fast_mode === false || input.noFast === true || input.no_fast === true
  const explicitFast = input.fastMode === true || input.fast_mode === true || input.fast === true
  const serviceTier: AgentServiceTier = explicitNoFast
    ? 'standard'
    : explicitTier === 'standard'
      ? 'standard'
      : 'fast'
  return {
    schema: FAST_MODE_POLICY_SCHEMA,
    generated_at: nowIso(),
    fast_mode: serviceTier === 'fast',
    service_tier: serviceTier,
    default_fast_mode: true,
    disabled_by: explicitNoFast ? 'no-fast' : serviceTier === 'standard' ? 'service-tier-standard' : 'none',
    explicit_fast: explicitFast,
    explicit_no_fast: explicitNoFast,
    explicit_service_tier: explicitTier
  }
}

export function fastModeEnv(policy: FastModePolicy): NodeJS.ProcessEnv {
  return {
    SKS_FAST_MODE: policy.fast_mode ? '1' : '0',
    SKS_SERVICE_TIER: policy.service_tier,
    SKS_REASONING_PROFILE_SUFFIX: policy.fast_mode ? 'fast' : 'standard'
  }
}

export function applyFastModeToRoster<T extends Record<string, any>>(roster: T, policy: FastModePolicy): T {
  const rows = Array.isArray(roster?.roster) ? roster.roster : []
  return {
    ...roster,
    service_tier: policy.service_tier,
    fast_mode: policy.fast_mode,
    roster: rows.map((entry: any) => ({
      ...entry,
      service_tier: policy.service_tier,
      fast_mode: policy.fast_mode,
      reasoning_profile: normalizeReasoningProfile(entry.reasoning_profile, policy)
    })),
    effort_policy: roster?.effort_policy
      ? {
          ...roster.effort_policy,
          service_tier: policy.service_tier,
          fast_mode: policy.fast_mode,
          decisions: Array.isArray(roster.effort_policy.decisions)
            ? roster.effort_policy.decisions.map((entry: any) => ({
                ...entry,
                service_tier: policy.service_tier,
                fast_mode: policy.fast_mode,
                reasoning_profile: normalizeReasoningProfile(entry.reasoning_profile, policy)
              }))
            : roster.effort_policy.decisions
        }
      : roster?.effort_policy
  }
}

export async function writeFastModePropagationProof(root: string, input: { policy: FastModePolicy; backend?: string; results?: any[] } = { policy: resolveFastModePolicy() }) {
  const workerFastReports = await collectNamedJson(root, 'worker-fast-mode.json')
  const workerProcessReports = await collectNamedJson(root, 'worker-process-report.json')
  const agentProcessReports = await collectNamedJson(root, 'agent-process-report.json')
  const zellijReports = await collectNamedJson(root, 'agent-zellij-report.json')
  const madReports = await collectNamedJson(root, 'mad-sks-worker-report.json')
  const defaultFastExpected = input.policy.disabled_by === 'none'
  const childReports = [...workerFastReports, ...workerProcessReports, ...agentProcessReports, ...zellijReports, ...madReports]
  const missingFast = defaultFastExpected
    ? childReports.filter((row) => row.json?.fast_mode !== true && row.json?.fast_mode !== 'true')
    : []
  const missingTier = childReports.filter((row) => {
    const value = String(row.json?.service_tier || '')
    return value && value !== input.policy.service_tier
  })
  const missingCliOverride = input.policy.service_tier === 'fast'
    ? childReports.filter((row) => row.json?.backend === 'codex-exec' && row.json?.service_tier_cli_override_present !== true)
    : []
  const workerMissing = defaultFastExpected && workerFastReports.length === 0 && workerProcessReports.length === 0
    ? ['fast_mode_worker_reports_missing']
    : []
  const report = {
    schema: FAST_MODE_PROPAGATION_PROOF_SCHEMA,
    generated_at: nowIso(),
    ok: missingFast.length === 0 && missingTier.length === 0 && workerMissing.length === 0 && missingCliOverride.length === 0,
    policy: input.policy,
    backend: input.backend || null,
    default_fast_mode: true,
    service_tier: input.policy.service_tier,
    fast_mode: input.policy.fast_mode,
    worker_fast_report_count: workerFastReports.length,
    worker_process_report_count: workerProcessReports.length,
    codex_exec_process_report_count: agentProcessReports.filter((row) => row.json?.backend === 'codex-exec').length,
    process_report_count: agentProcessReports.filter((row) => row.json?.backend === 'process').length,
    zellij_report_count: zellijReports.length,
    mad_report_count: madReports.length,
    child_report_count: childReports.length,
    artifacts: childReports.map((row) => row.relative_path),
    blockers: [
      ...workerMissing,
      ...missingFast.map((row) => `fast_mode_missing:${row.relative_path}`),
      ...missingTier.map((row) => `service_tier_mismatch:${row.relative_path}`),
      ...missingCliOverride.map((row) => `service_tier_cli_override_missing:${row.relative_path}`)
    ]
  }
  await writeJsonAtomic(path.join(root, 'fast-mode-propagation-proof.json'), report)
  return report
}

function normalizeServiceTier(value: unknown, fallback: AgentServiceTier | null = 'fast'): AgentServiceTier | null {
  const text = String(value || '').toLowerCase()
  if (text === 'fast' || text === 'standard') return text
  return fallback
}

function normalizeReasoningProfile(value: unknown, policy: FastModePolicy) {
  const profile = String(value || 'sks-agent-medium-fast')
  return policy.fast_mode ? profile.replace(/-standard$/, '-fast') : profile.replace(/-fast$/, '-standard')
}

async function collectNamedJson(root: string, filename: string) {
  const out: Array<{ path: string; relative_path: string; json: any }> = []
  await walk(root, async (file) => {
    if (path.basename(file) !== filename) return
    const json = await readJson<any>(file, null).catch(() => null)
    if (json) out.push({ path: file, relative_path: path.relative(root, file), json })
  })
  return out
}

async function walk(dir: string, visit: (file: string) => Promise<void>) {
  let entries: Array<import('node:fs').Dirent>
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await walk(full, visit)
    else await visit(full)
  }
}
