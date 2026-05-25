import path from 'node:path'
import { ensureDir, nowIso, sha256, writeJsonAtomic } from '../fsx.js'

export const CODEX_WEB_SEARCH_EVIDENCE_SCHEMA = 'sks.codex-web-search-evidence.v1'

export interface CodexWebSearchCapability {
  schema: 'sks.codex-web-search-capability.v1'
  available: boolean
  status: 'available' | 'unavailable' | 'degraded_unverified' | 'disabled_offline'
  reason: string | null
}

export interface CodexWebSourceRecord {
  provider: 'codex_web'
  id: string
  title: string
  url: string | null
  snippet: string
  retrieved_at: string
}

export interface CodexWebSearchEvidence {
  schema: typeof CODEX_WEB_SEARCH_EVIDENCE_SCHEMA
  generated_at: string
  ok: boolean
  query: string
  status: 'completed' | 'degraded' | 'disabled'
  capability: CodexWebSearchCapability
  request_artifact: string | null
  response_artifact: string | null
  normalized_results: CodexWebSourceRecord[]
  blockers: string[]
  warnings: string[]
}

export type CodexWebSearchFunction = (query: string) => Promise<unknown>

export function detectCodexWebSearchCapability(opts: { env?: NodeJS.ProcessEnv; offline?: boolean } = {}): CodexWebSearchCapability {
  if (opts.offline) {
    return { schema: 'sks.codex-web-search-capability.v1', available: false, status: 'disabled_offline', reason: 'offline_mode_requested' }
  }
  const env = opts.env || process.env
  if (env.SKS_CODEX_WEB_SEARCH_AVAILABLE === '1' || env.CODEX_WEB_SEARCH_AVAILABLE === '1') {
    return { schema: 'sks.codex-web-search-capability.v1', available: true, status: 'available', reason: 'env_capability_present' }
  }
  if (env.SKS_CODEX_WEB_SEARCH_AVAILABLE === '0' || env.CODEX_WEB_SEARCH_AVAILABLE === '0') {
    return { schema: 'sks.codex-web-search-capability.v1', available: false, status: 'unavailable', reason: 'env_capability_disabled' }
  }
  return { schema: 'sks.codex-web-search-capability.v1', available: false, status: 'degraded_unverified', reason: 'model_tool_capability_not_exposed_to_runtime' }
}

export async function runCodexWebSearch(
  query: string,
  opts: { search?: CodexWebSearchFunction; artifactDir?: string; offline?: boolean; env?: NodeJS.ProcessEnv } = {}
): Promise<CodexWebSearchEvidence> {
  const capability = detectCodexWebSearchCapability({
    ...(opts.env ? { env: opts.env } : {}),
    ...(opts.offline === undefined ? {} : { offline: opts.offline })
  })
  if (capability.status === 'disabled_offline') return disabledEvidence(query, capability)
  const request = {
    schema: 'sks.codex-web-search-request.v1',
    generated_at: nowIso(),
    query,
    provider: 'codex_web'
  }
  let requestArtifact: string | null = null
  let responseArtifact: string | null = null
  if (opts.artifactDir) {
    await ensureDir(opts.artifactDir)
    requestArtifact = path.join(opts.artifactDir, `codex-web-search-request-${sha256(query).slice(0, 12)}.json`)
    await writeJsonAtomic(requestArtifact, request)
  }
  if (!opts.search) {
    return {
      schema: CODEX_WEB_SEARCH_EVIDENCE_SCHEMA,
      generated_at: nowIso(),
      ok: capability.available,
      query,
      status: 'degraded',
      capability,
      request_artifact: requestArtifact,
      response_artifact: null,
      normalized_results: [],
      blockers: capability.status === 'unavailable' ? ['codex_web_search_unavailable'] : [],
      warnings: ['codex_web_search_runtime_adapter_not_invoked']
    }
  }
  const raw = await opts.search(query)
  const normalized = normalizeCodexWebResults(raw)
  if (opts.artifactDir) {
    responseArtifact = path.join(opts.artifactDir, `codex-web-search-response-${sha256(JSON.stringify(raw)).slice(0, 12)}.json`)
    await writeJsonAtomic(responseArtifact, { schema: 'sks.codex-web-search-response.v1', generated_at: nowIso(), raw, normalized_results: normalized })
  }
  return {
    schema: CODEX_WEB_SEARCH_EVIDENCE_SCHEMA,
    generated_at: nowIso(),
    ok: true,
    query,
    status: 'completed',
    capability: { ...capability, available: true, status: 'available', reason: capability.reason || 'adapter_invoked' },
    request_artifact: requestArtifact,
    response_artifact: responseArtifact,
    normalized_results: normalized,
    blockers: [],
    warnings: []
  }
}

export function normalizeCodexWebResults(raw: unknown): CodexWebSourceRecord[] {
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as any)?.results)
      ? (raw as any).results
      : Array.isArray((raw as any)?.items)
        ? (raw as any).items
        : []
  const retrievedAt = nowIso()
  return rows.map((row: any, index: number) => ({
    provider: 'codex_web' as const,
    id: String(row.id || row.url || row.link || `codex-web-${index + 1}`),
    title: String(row.title || row.name || `Codex Web result ${index + 1}`),
    url: row.url || row.link || null,
    snippet: String(row.snippet || row.summary || row.text || ''),
    retrieved_at: retrievedAt
  }))
}

function disabledEvidence(query: string, capability: CodexWebSearchCapability): CodexWebSearchEvidence {
  return {
    schema: CODEX_WEB_SEARCH_EVIDENCE_SCHEMA,
    generated_at: nowIso(),
    ok: true,
    query,
    status: 'disabled',
    capability,
    request_artifact: null,
    response_artifact: null,
    normalized_results: [],
    blockers: [],
    warnings: ['codex_web_search_disabled_for_offline_mode']
  }
}
