import type { LocalModelConfig, LocalModelProvider, OllamaWorkerConfig } from '../agents/ollama-worker-config.js'
import { callOllamaGenerate, listOllamaModels, ollamaTokensPerSecond, probeOllamaVersion, type OllamaGenerateRequest, type OllamaGenerateResponse } from './local-llm-ollama-client.js'
import { callOpenAiCompatibleLocalChat } from './local-llm-openai-compatible-client.js'

export interface LocalLlmModelCandidate {
  provider: LocalModelProvider
  model: string
  base_url: string
  endpoint: string
  source: string
  models: string[]
}

export interface LocalLlmGenerateRequest extends OllamaGenerateRequest {
  messages?: Array<{ role: string; content: string }>
}

export type LocalLlmGenerateResponse = OllamaGenerateResponse & {
  provider?: LocalModelProvider
  raw?: unknown
}

export async function probeLocalLlmEndpoint(config: Pick<LocalModelConfig | OllamaWorkerConfig, 'provider' | 'base_url' | 'timeout_ms'>) {
  if (config.provider === 'ollama') return probeOllamaVersion(config.base_url, Math.min(5000, Number(config.timeout_ms || 3000)))
  return probeOpenAiCompatibleModels(config.base_url, Math.min(5000, Number(config.timeout_ms || 3000)))
}

export async function listLocalLlmModels(config: Pick<LocalModelConfig | OllamaWorkerConfig, 'provider' | 'base_url' | 'timeout_ms'>) {
  if (config.provider === 'ollama') return listOllamaModels(config.base_url, Math.min(5000, Number(config.timeout_ms || 5000)))
  return listOpenAiCompatibleModels(config.base_url, Math.min(5000, Number(config.timeout_ms || 5000)))
}

export async function callLocalLlmGenerate(
  config: Pick<LocalModelConfig | OllamaWorkerConfig, 'provider' | 'base_url' | 'timeout_ms' | 'temperature'>,
  request: LocalLlmGenerateRequest
): Promise<{ ok: true; data: LocalLlmGenerateResponse; text: string } | { ok: false; error: string; status?: number }> {
  if (config.provider === 'ollama') return callOllamaGenerate(config, request)
  const response = await callOpenAiCompatibleLocalChat({
    endpoint: config.base_url,
    model: request.model,
    messages: request.messages || [{ role: 'user', content: request.prompt }],
    temperature: Number((request.options || {}).temperature ?? config.temperature ?? 0)
  }, Number(config.timeout_ms || 20_000))
  if (!response.ok) return { ok: false, status: response.status, error: `http_${response.status}:${String(response.error || '').slice(0, 500)}` }
  const text = extractOpenAiCompatibleText(response.data)
  return {
    ok: true,
    data: {
      provider: config.provider,
      model: request.model,
      response: text,
      raw: response.data
    },
    text
  }
}

export function localLlmTokensPerSecond(data: LocalLlmGenerateResponse, fallbackText = '', latencyMs = 0) {
  return ollamaTokensPerSecond(data, fallbackText, latencyMs)
}

export async function detectInstalledLocalModelCandidate(input: {
  preferredModel?: string
  mlxBaseUrl?: string
  ollamaBaseUrl?: string
  openAiCompatibleBaseUrl?: string
  timeoutMs?: number
} = {}): Promise<LocalLlmModelCandidate | null> {
  const timeoutMs = input.timeoutMs || 3000
  const endpoints: Array<{ provider: LocalModelProvider; base_url: string; source: string }> = [
    { provider: 'mlx-lm', base_url: trimTrailingSlash(input.mlxBaseUrl || process.env.SKS_MLX_LM_BASE_URL || process.env.SKS_LOCAL_LLM_BASE_URL || 'http://127.0.0.1:8080'), source: 'mlx_lm_server_v1_models' },
    { provider: 'openai-compatible', base_url: trimTrailingSlash(input.openAiCompatibleBaseUrl || process.env.SKS_OPENAI_COMPATIBLE_BASE_URL || process.env.SKS_LOCAL_OPENAI_COMPATIBLE_BASE_URL || process.env.LM_STUDIO_BASE_URL || 'http://127.0.0.1:1234'), source: 'openai_compatible_v1_models' },
    { provider: 'ollama', base_url: trimTrailingSlash(input.ollamaBaseUrl || process.env.SKS_OLLAMA_BASE_URL || 'http://127.0.0.1:11434'), source: 'ollama_api_tags' }
  ]
  const seen = new Set<string>()
  for (const endpoint of endpoints) {
    if (!endpoint.base_url) continue
    const key = `${endpoint.provider}:${endpoint.base_url}`
    if (seen.has(key)) continue
    seen.add(key)
    const listed = await listLocalLlmModels({ ...endpoint, timeout_ms: timeoutMs }).catch(() => ({ ok: false, models: [] as string[] }))
    if (!listed.ok || listed.models.length === 0) continue
    const model = chooseModel(listed.models, input.preferredModel)
    return { ...endpoint, endpoint: endpoint.base_url, model, models: listed.models }
  }
  return null
}

async function probeOpenAiCompatibleModels(baseUrl: string, timeoutMs = 3000) {
  const models = await listOpenAiCompatibleModels(baseUrl, timeoutMs)
  return { ...models, data: models.ok ? { models: models.models } : null }
}

async function listOpenAiCompatibleModels(baseUrl: string, timeoutMs = 5000) {
  try {
    const response = await fetch(`${trimTrailingSlash(baseUrl)}/v1/models`, { signal: AbortSignal.timeout(timeoutMs) })
    const text = await response.text()
    const data = response.ok ? JSON.parse(text) : null
    const models = Array.isArray(data?.data) ? data.data.map((model: any) => String(model?.id || '')).filter(Boolean) : []
    return { ok: response.ok, status: response.status, models, data, error: response.ok ? null : text.slice(0, 500) }
  } catch (error: unknown) {
    return { ok: false, status: 0, models: [], data: null, error: error instanceof Error ? error.message : String(error) }
  }
}

function extractOpenAiCompatibleText(data: any) {
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null
  if (typeof choice?.message?.content === 'string') return choice.message.content
  if (typeof choice?.text === 'string') return choice.text
  if (typeof data?.response === 'string') return data.response
  if (typeof data?.content === 'string') return data.content
  return ''
}

function chooseModel(models: string[], preferredModel = '') {
  const preferred = String(preferredModel || '').trim()
  if (preferred && models.includes(preferred)) return preferred
  const qwen = models.find((model) => /qwen/i.test(model))
  return qwen || models[0] || ''
}

function trimTrailingSlash(value: string) {
  return String(value || '').replace(/\/+$/, '')
}
