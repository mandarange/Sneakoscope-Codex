import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'

export interface CodexAccountUsageSnapshot {
  schema: 'sks.codex-account-usage.v1'
  generated_at: string
  ok: boolean
  source: 'app-server' | 'unavailable' | 'fake'
  account_id?: string | null
  token_usage?: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
    reset_at?: string | null
  } | null
  usage_limit_tokens?: number | null
  blockers: string[]
}

export async function collectCodexAccountUsage(): Promise<CodexAccountUsageSnapshot> {
  if (process.env.SKS_CODEX_ACCOUNT_USAGE_FAKE === '1') {
    return {
      schema: 'sks.codex-account-usage.v1',
      generated_at: nowIso(),
      ok: true,
      source: 'fake',
      account_id: 'fake-account',
      token_usage: {
        input_tokens: 1000,
        output_tokens: 500,
        total_tokens: 1500,
        reset_at: null
      },
      usage_limit_tokens: 100000,
      blockers: []
    }
  }
  const url = String(process.env.SKS_CODEX_APP_SERVER_USAGE_URL || process.env.CODEX_APP_SERVER_USAGE_URL || '').trim()
  if (!url) return unavailable(['codex_app_server_usage_endpoint_unavailable'])
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return unavailable([`codex_app_server_usage_http_${response.status}`])
    const payload: any = await response.json()
    return normalizeUsagePayload(payload, 'app-server')
  } catch (err: any) {
    return unavailable([`codex_app_server_usage_fetch_failed:${err?.message || String(err)}`])
  }
}

export async function writeCodexAccountUsageArtifacts(root: string, input: { missionId?: string | null } = {}) {
  const snapshot = await collectCodexAccountUsage()
  const rootArtifact = path.join(root, '.sneakoscope', 'codex-account-usage.json')
  await writeJsonAtomic(rootArtifact, snapshot)
  let missionArtifact: string | null = null
  if (input.missionId) {
    missionArtifact = path.join(root, '.sneakoscope', 'missions', input.missionId, 'codex-account-usage.json')
    await writeJsonAtomic(missionArtifact, snapshot)
  }
  return { snapshot, root_artifact: rootArtifact, mission_artifact: missionArtifact }
}

function normalizeUsagePayload(payload: any, source: 'app-server'): CodexAccountUsageSnapshot {
  const usage = payload?.token_usage || payload?.usage || payload
  const input = Number(usage?.input_tokens || usage?.inputTokens || 0)
  const output = Number(usage?.output_tokens || usage?.outputTokens || 0)
  const total = Number(usage?.total_tokens || usage?.totalTokens || input + output)
  return {
    schema: 'sks.codex-account-usage.v1',
    generated_at: nowIso(),
    ok: true,
    source,
    account_id: payload?.account_id || payload?.accountId || null,
    token_usage: {
      input_tokens: Number.isFinite(input) ? input : 0,
      output_tokens: Number.isFinite(output) ? output : 0,
      total_tokens: Number.isFinite(total) ? total : 0,
      reset_at: usage?.reset_at || usage?.resetAt || null
    },
    usage_limit_tokens: Number.isFinite(Number(payload?.usage_limit_tokens || payload?.usageLimitTokens)) ? Number(payload?.usage_limit_tokens || payload?.usageLimitTokens) : null,
    blockers: []
  }
}

function unavailable(blockers: string[]): CodexAccountUsageSnapshot {
  return {
    schema: 'sks.codex-account-usage.v1',
    generated_at: nowIso(),
    ok: true,
    source: 'unavailable',
    token_usage: null,
    usage_limit_tokens: null,
    blockers
  }
}
