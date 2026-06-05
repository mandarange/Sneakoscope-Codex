import type { LocalModelConfig, OllamaWorkerConfig } from '../agents/ollama-worker-config.js'

export interface OllamaGenerateRequest {
  model: string
  prompt: string
  stream?: boolean
  format?: 'json' | string
  think?: boolean
  keep_alive?: string
  options?: Record<string, unknown>
}

export interface OllamaGenerateResponse {
  model?: string
  response?: string
  done?: boolean
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
  [key: string]: unknown
}

export async function probeOllamaVersion(baseUrl: string, timeoutMs = 3000) {
  try {
    const response = await fetch(`${trimTrailingSlash(baseUrl)}/api/version`, { signal: AbortSignal.timeout(timeoutMs) })
    const text = await response.text()
    return { ok: response.ok, status: response.status, data: response.ok ? JSON.parse(text) : null, error: response.ok ? null : text.slice(0, 500) }
  } catch (error: unknown) {
    return { ok: false, status: 0, data: null, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function listOllamaModels(baseUrl: string, timeoutMs = 5000) {
  try {
    const response = await fetch(`${trimTrailingSlash(baseUrl)}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) })
    const text = await response.text()
    const data = response.ok ? JSON.parse(text) : null
    const models = Array.isArray(data?.models) ? data.models.map((model: any) => String(model?.name || '')).filter(Boolean) : []
    return { ok: response.ok, status: response.status, models, data, error: response.ok ? null : text.slice(0, 500) }
  } catch (error: unknown) {
    return { ok: false, status: 0, models: [], data: null, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function callOllamaGenerate(
  config: Pick<LocalModelConfig | OllamaWorkerConfig, 'base_url' | 'timeout_ms'>,
  request: OllamaGenerateRequest
): Promise<{ ok: true; data: OllamaGenerateResponse; text: string } | { ok: false; error: string; status?: number }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1, Number(config.timeout_ms || 20_000)))
  try {
    const response = await fetch(`${trimTrailingSlash(config.base_url)}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal
    })
    const text = await response.text()
    if (!response.ok) return { ok: false, status: response.status, error: `http_${response.status}:${text.slice(0, 500)}` }
    const data = JSON.parse(text)
    return { ok: true, data, text: extractOllamaText(data) }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

export function extractOllamaText(data: OllamaGenerateResponse) {
  if (typeof data.response === 'string') return data.response
  if (typeof (data as any).message?.content === 'string') return (data as any).message.content
  if (typeof (data as any).content === 'string') return (data as any).content
  return ''
}

export function ollamaTokensPerSecond(data: OllamaGenerateResponse, fallbackText = '', latencyMs = 0) {
  const evalCount = Number(data.eval_count || 0)
  const evalDurationNs = Number(data.eval_duration || 0)
  if (evalCount > 0 && evalDurationNs > 0) return Number((evalCount / (evalDurationNs / 1_000_000_000)).toFixed(2))
  const approximateTokens = Math.max(1, Math.ceil(fallbackText.length / 4))
  const seconds = Math.max(0.001, latencyMs / 1000)
  return Number((approximateTokens / seconds).toFixed(2))
}

function trimTrailingSlash(value: string) {
  return String(value || '').replace(/\/+$/, '')
}
