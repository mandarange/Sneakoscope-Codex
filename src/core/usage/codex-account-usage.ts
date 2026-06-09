import path from 'node:path'
import { findCodexBinary } from '../codex-adapter.js'
import { nowIso, runProcess, writeJsonAtomic } from '../fsx.js'

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
  attempted_sources: string[]
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
      attempted_sources: ['fake'],
      blockers: []
    }
  }
  const attemptedSources: string[] = []
  const urls: Array<[string, string | undefined]> = [
    ['CODEX_APP_SERVER_USAGE_URL', process.env.CODEX_APP_SERVER_USAGE_URL],
    ['SKS_CODEX_APP_SERVER_USAGE_URL', process.env.SKS_CODEX_APP_SERVER_USAGE_URL],
    ...localWellKnownUsageUrls().map((url): [string, string] => [`local:${url}`, url])
  ]
  const blockers: string[] = []
  for (const [label, rawUrl] of urls) {
    const url = String(rawUrl || '').trim()
    if (!url) continue
    attemptedSources.push(label)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(label.startsWith('local:') ? 800 : 5000) })
      if (!response.ok) {
        blockers.push(`codex_app_server_usage_http_${response.status}:${label}`)
        continue
      }
      const payload: any = await response.json()
      return normalizeUsagePayload(payload, 'app-server', attemptedSources)
    } catch (err: any) {
      blockers.push(`codex_app_server_usage_fetch_failed:${label}:${err?.message || String(err)}`)
    }
  }
  const cli = await collectUsageFromCodexCli(attemptedSources).catch((err: any) => {
    blockers.push(`codex_cli_usage_probe_failed:${err?.message || String(err)}`)
    return null
  })
  if (cli) return cli
  return unavailable(attemptedSources.length ? blockers : ['codex_app_server_usage_endpoint_unavailable'], attemptedSources)
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

function normalizeUsagePayload(payload: any, source: 'app-server' | 'unavailable', attemptedSources: string[]): CodexAccountUsageSnapshot {
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
    attempted_sources: attemptedSources,
    blockers: []
  }
}

function unavailable(blockers: string[], attemptedSources: string[] = []): CodexAccountUsageSnapshot {
  return {
    schema: 'sks.codex-account-usage.v1',
    generated_at: nowIso(),
    ok: false,
    source: 'unavailable',
    token_usage: null,
    usage_limit_tokens: null,
    attempted_sources: attemptedSources,
    blockers
  }
}

function localWellKnownUsageUrls(): string[] {
  const ports = [
    process.env.CODEX_APP_SERVER_PORT,
    process.env.SKS_CODEX_APP_SERVER_PORT,
    1455,
    1456,
    3000
  ].map((value) => Number(value)).filter((value, index, rows) => Number.isFinite(value) && value > 0 && rows.indexOf(value) === index)
  return ports.flatMap((port) => [
    `http://127.0.0.1:${port}/usage`,
    `http://127.0.0.1:${port}/api/usage`,
    `http://127.0.0.1:${port}/.well-known/codex/usage`
  ])
}

async function collectUsageFromCodexCli(attemptedSources: string[]): Promise<CodexAccountUsageSnapshot | null> {
  const bin = await findCodexBinary()
  if (!bin) return null
  const commands = [
    ['account', 'usage', '--json'],
    ['usage', '--json'],
    ['app-server', 'status', '--json']
  ]
  for (const args of commands) {
    const label = `codex-cli:${args.join(' ')}`
    attemptedSources.push(label)
    const result = await runProcess(bin, args, { timeoutMs: 3000, maxOutputBytes: 64 * 1024 }).catch(() => null)
    if (!result || result.code !== 0) continue
    try {
      const payload = JSON.parse(`${result.stdout || ''}${result.stderr || ''}`.trim() || '{}')
      const normalized = normalizeUsagePayload(payload, 'app-server', attemptedSources)
      return { ...normalized, source: 'app-server' }
    } catch {}
  }
  return null
}
