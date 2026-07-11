import { findCodexBinary } from '../codex-adapter.js'
import { runProcess } from '../fsx.js'

const FALLBACK_EFFORT_ORDER = ['minimal', 'low', 'medium', 'high', 'xhigh']

export interface CodexModelMetadata {
  schema: 'sks.codex-model-metadata.v1'
  model: string
  advertised_efforts: string[]
  default_effort: string
  source: 'app-server' | 'codex-cli' | 'env' | 'fallback'
  blockers: string[]
}

export async function collectCodexModelMetadata(input: { model?: string | null } = {}): Promise<CodexModelMetadata> {
  if (process.env.SKS_CODEX_MODEL_METADATA_FAKE === '1') {
    const advertised = normalizeAdvertisedEfforts(process.env.SKS_CODEX_MODEL_EFFORTS || 'low,medium,high,xhigh')
    return metadata(String(input.model || process.env.SKS_CODEX_MODEL || process.env.CODEX_MODEL || ''), advertised, 'medium', 'app-server', [])
  }
  const model = String(input.model || process.env.SKS_CODEX_MODEL || process.env.CODEX_MODEL || '').trim()
  const appServer = await readAppServerMetadata(model)
  if (appServer) return appServer
  const cli = await readCodexCliMetadata(model)
  if (cli) return cli
  const envEfforts = normalizeAdvertisedEfforts(process.env.SKS_CODEX_MODEL_EFFORTS || '')
  if (envEfforts.length) return metadata(model, envEfforts, process.env.SKS_CODEX_MODEL_DEFAULT_EFFORT || 'medium', 'env', [])
  return metadata(model, FALLBACK_EFFORT_ORDER, 'medium', 'fallback', ['codex_model_metadata_unavailable'])
}

async function readAppServerMetadata(model: string): Promise<CodexModelMetadata | null> {
  const url = String(process.env.CODEX_APP_SERVER_METADATA_URL || process.env.SKS_CODEX_APP_SERVER_METADATA_URL || '').trim()
  if (!url) return null
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) })
    if (!response.ok) return null
    const payload: any = await response.json()
    return normalizePayload(payload, model, 'app-server')
  } catch {
    return null
  }
}

async function readCodexCliMetadata(model: string): Promise<CodexModelMetadata | null> {
  const bin = await findCodexBinary()
  if (!bin) return null
  const commands = [
    ['model', 'metadata', '--json'],
    ['debug', 'model-metadata', '--json'],
    ['capabilities', '--json']
  ]
  for (const args of commands) {
    const result = await runProcess(bin, args, { timeoutMs: 3000, maxOutputBytes: 64 * 1024 }).catch(() => null)
    if (!result || result.code !== 0) continue
    try {
      const payload = JSON.parse(`${result.stdout || ''}${result.stderr || ''}`.trim() || '{}')
      const normalized = normalizePayload(payload, model, 'codex-cli')
      if (normalized.advertised_efforts.length) return normalized
    } catch {}
  }
  return null
}

function normalizePayload(payload: any, fallbackModel: string, source: 'app-server' | 'codex-cli'): CodexModelMetadata {
  const catalog = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : null
  const reportedSelection = String(payload?.selected_model || payload?.current_model || payload?.active_model || '').trim()
  const requestedModel = String(fallbackModel || reportedSelection).trim()
  const row = catalog
    ? requestedModel
      ? catalog.find((candidate: any) => String(candidate?.id || candidate?.model || candidate?.slug || candidate?.name || '') === requestedModel) || null
      : null
    : payload?.model_metadata || payload?.metadata || payload
  if (!row) {
    return metadata(
      requestedModel,
      [],
      'medium',
      source,
      [requestedModel ? 'codex_model_not_found_in_advertised_catalog' : 'codex_model_selection_unknown']
    )
  }
  const effortRows = row?.supportedReasoningEfforts || row?.supported_reasoning_levels || row?.supported_reasoning_efforts || []
  const structuredEfforts = Array.isArray(effortRows)
    ? effortRows.map((entry: any) => entry?.reasoningEffort || entry?.effort || entry)
    : []
  const efforts = normalizeAdvertisedEfforts(structuredEfforts.length ? structuredEfforts : row?.advertised_efforts || row?.advertisedEfforts || row?.reasoning_efforts || row?.reasoningEfforts || payload?.advertised_efforts)
  return metadata(String(row?.model || row?.id || row?.slug || row?.name || requestedModel), efforts, row?.default_reasoning_level || row?.defaultReasoningLevel || row?.default_effort || row?.defaultEffort || payload?.default_effort || 'medium', source, efforts.length ? [] : ['codex_model_metadata_efforts_missing'])
}

function metadata(model: string, efforts: string[], defaultEffort: string, source: CodexModelMetadata['source'], blockers: string[]): CodexModelMetadata {
  const advertised = normalizeAdvertisedEfforts(efforts)
  const defaultValue = advertised.includes(defaultEffort) ? defaultEffort : advertised.includes('medium') ? 'medium' : advertised[0] || 'medium'
  return {
    schema: 'sks.codex-model-metadata.v1',
    model,
    advertised_efforts: advertised,
    default_effort: defaultValue,
    source,
    blockers
  }
}

function normalizeAdvertisedEfforts(value: any): string[] {
  const rows = Array.isArray(value) ? value : String(value || '').split(',')
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of rows) {
    const effort = String(row || '').trim().toLowerCase()
    if (!effort || seen.has(effort)) continue
    seen.add(effort)
    out.push(effort)
  }
  return out
}
