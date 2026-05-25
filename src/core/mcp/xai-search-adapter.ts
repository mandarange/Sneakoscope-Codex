import path from 'node:path'
import { ensureDir, nowIso, sha256, writeJsonAtomic } from '../fsx.js'

export const XAI_SEARCH_EVIDENCE_SCHEMA = 'sks.xai-search-evidence.v1'

export interface NormalizedXaiSourceRecord {
  provider: 'xai'
  id: string
  title: string
  url: string | null
  snippet: string
  published_at: string | null
  local_only_raw_artifact: string | null
}

export interface XaiSearchEvidence {
  schema: typeof XAI_SEARCH_EVIDENCE_SCHEMA
  generated_at: string
  ok: boolean
  query: string
  status: 'completed' | 'blocked' | 'timeout' | 'not_configured'
  timeout_ms: number
  results: NormalizedXaiSourceRecord[]
  raw_response_artifact: string | null
  redacted_summary: {
    result_count: number
    urls: Array<string | null>
  }
  blockers: string[]
}

export type XaiSearchFunction = (query: string) => Promise<unknown>

export async function runXaiSearch(
  query: string,
  opts: { search?: XaiSearchFunction; artifactDir?: string; timeoutMs?: number; configured?: boolean } = {}
): Promise<XaiSearchEvidence> {
  const timeoutMs = opts.timeoutMs || 10_000
  if (opts.configured === false) return blockedEvidence(query, timeoutMs, 'not_configured', ['xai_mcp_missing'])
  if (!opts.search) return blockedEvidence(query, timeoutMs, 'blocked', ['xai_search_adapter_missing'])
  try {
    const raw = await withTimeout(opts.search(query), timeoutMs)
    const results = normalizeXaiSearchResults(raw)
    let rawArtifact: string | null = null
    if (opts.artifactDir) {
      await ensureDir(opts.artifactDir)
      rawArtifact = path.join(opts.artifactDir, `xai-search-raw-${sha256(JSON.stringify({ query, raw })).slice(0, 12)}.json`)
      await writeJsonAtomic(rawArtifact, { schema: 'sks.xai-search-raw-local-only.v1', generated_at: nowIso(), local_only: true, query, raw })
    }
    return {
      schema: XAI_SEARCH_EVIDENCE_SCHEMA,
      generated_at: nowIso(),
      ok: true,
      query,
      status: 'completed',
      timeout_ms: timeoutMs,
      results: results.map((record) => ({ ...record, local_only_raw_artifact: rawArtifact })),
      raw_response_artifact: rawArtifact,
      redacted_summary: {
        result_count: results.length,
        urls: results.map((record) => record.url)
      },
      blockers: []
    }
  } catch (err: unknown) {
    const timeout = err instanceof Error && err.message === 'xai_search_timeout'
    return blockedEvidence(query, timeoutMs, timeout ? 'timeout' : 'blocked', [
      timeout ? 'xai_search_timeout' : `xai_search_failure:${err instanceof Error ? err.message : String(err)}`
    ])
  }
}

export function normalizeXaiSearchResults(raw: unknown): NormalizedXaiSourceRecord[] {
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as any)?.results)
      ? (raw as any).results
      : Array.isArray((raw as any)?.data)
        ? (raw as any).data
        : []
  return rows.map((row: any, index: number) => ({
    provider: 'xai' as const,
    id: String(row.id || row.url || row.link || `xai-${index + 1}`),
    title: String(row.title || row.name || row.heading || `X AI result ${index + 1}`),
    url: row.url || row.link || null,
    snippet: String(row.snippet || row.summary || row.text || ''),
    published_at: row.published_at || row.publishedAt || row.date || null,
    local_only_raw_artifact: null
  }))
}

export function redactXaiRawResponse(raw: unknown) {
  const results = normalizeXaiSearchResults(raw)
  return {
    provider: 'xai',
    result_count: results.length,
    results: results.map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.snippet.slice(0, 240),
      published_at: result.published_at
    }))
  }
}

function blockedEvidence(
  query: string,
  timeoutMs: number,
  status: XaiSearchEvidence['status'],
  blockers: string[]
): XaiSearchEvidence {
  return {
    schema: XAI_SEARCH_EVIDENCE_SCHEMA,
    generated_at: nowIso(),
    ok: false,
    query,
    status,
    timeout_ms: timeoutMs,
    results: [],
    raw_response_artifact: null,
    redacted_summary: { result_count: 0, urls: [] },
    blockers
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('xai_search_timeout')), timeoutMs)
    timer.unref?.()
    promise.then((value) => {
      clearTimeout(timer)
      resolve(value)
    }, (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}
