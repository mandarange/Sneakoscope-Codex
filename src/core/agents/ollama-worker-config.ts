import os from 'node:os'
import path from 'node:path'
import { ensureDir, exists, nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export const LOCAL_MODEL_CONFIG_SCHEMA = 'sks.local-model-config.v1'
export const LOCAL_MODEL_CONFIG_SCHEMA_V2 = 'sks.local-model-config.v2'
export const OLLAMA_WORKER_CONFIG_SCHEMA = 'sks.ollama-worker-config.v1'
export const DEFAULT_OLLAMA_CODER_MODEL = 'rafw007/qwen36-a3b-claude-coder:q4_K_M'
export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
export const DEFAULT_MLX_LM_MODEL = 'mlx-community/Qwen3.6-35B-A3B-4bit'
export const DEFAULT_MLX_LM_BASE_URL = 'http://127.0.0.1:8080'
export const DEFAULT_OLLAMA_KEEP_ALIVE = '30m'
export const DEFAULT_OLLAMA_TIMEOUT_MS = 120_000
export const DEFAULT_OLLAMA_THINK = false
export const LOCAL_LLM_SMOKE_TTL_MS = 24 * 60 * 60 * 1000

export type LocalModelProvider = 'ollama' | 'mlx-lm' | 'openai-compatible'
export type LocalModelStatus = 'disabled' | 'enabled_unverified' | 'verified' | 'degraded' | 'blocked'

export interface LocalModelCapability {
  api_reachable: boolean
  model_installed: boolean
  supports_streaming: boolean
  supports_json_schema: boolean
  supports_tools: boolean
  supports_images: boolean
  context_window: number
  max_parallel_requests: number
}

export interface LocalModelSmokeResult {
  ok: boolean
  skipped?: boolean
  ran_at?: string
  prompt_hash?: string
  latency_ms?: number
  tokens_per_second?: number
  schema_valid?: boolean
  result_path?: string
  status?: LocalModelStatus
  reason?: string
  blockers?: string[]
}

export interface LocalModelConfig {
  schema: typeof LOCAL_MODEL_CONFIG_SCHEMA_V2
  generated_at?: string
  updated_at?: string
  enabled: boolean
  status: LocalModelStatus
  provider: LocalModelProvider
  endpoint: string
  model: string
  base_url: string
  keep_alive: string
  timeout_ms: number
  temperature: number
  think: boolean
  policy: {
    role: 'worker_only'
    allowed_task_classes: string[]
    forbidden_task_classes: string[]
    requires_gpt_final: boolean
  }
  capability: LocalModelCapability
  last_smoke: LocalModelSmokeResult | null
  blockers: string[]
}

export interface OllamaWorkerConfig {
  schema: typeof OLLAMA_WORKER_CONFIG_SCHEMA
  ok: boolean
  enabled: boolean
  status: LocalModelStatus
  provider: LocalModelProvider
  model: string
  base_url: string
  endpoint: string
  keep_alive: string
  timeout_ms: number
  temperature: number
  think: boolean
  policy: LocalModelConfig['policy']
  capability: LocalModelCapability
  last_smoke: LocalModelSmokeResult | null
  config_path: string
  explicit_disable: boolean
  explicit_enable: boolean
  blockers: string[]
}

export function localModelConfigPath() {
  return process.env.SKS_LOCAL_MODEL_CONFIG
    ? path.resolve(process.env.SKS_LOCAL_MODEL_CONFIG)
    : path.join(os.homedir(), '.sneakoscope', 'local-model.json')
}

export async function readLocalModelConfig(): Promise<LocalModelConfig> {
  const raw = await readJson<any>(localModelConfigPath(), null)
  return normalizeLocalModelConfig(raw || {})
}

export async function writeLocalModelConfig(patch: Partial<LocalModelConfig>): Promise<LocalModelConfig> {
  const current = await readLocalModelConfig()
  const next = normalizeLocalModelConfig({ ...current, ...patch, updated_at: nowIso() })
  await ensureDir(path.dirname(localModelConfigPath()))
  await writeJsonAtomic(localModelConfigPath(), next)
  return next
}

export async function resolveOllamaWorkerConfig(input: {
  backend?: string
  ollamaEnabled?: boolean
  model?: string | null
  baseUrl?: string | null
  provider?: string | null
  keepAlive?: string | null
  timeoutMs?: number | null
  temperature?: number | null
  think?: boolean | null
} = {}): Promise<OllamaWorkerConfig> {
  const configExists = await exists(localModelConfigPath())
  const stored = await readLocalModelConfig()
  const explicitDisable = boolEnv(process.env.SKS_OLLAMA_WORKERS) === false
  const explicitEnable = boolEnv(process.env.SKS_OLLAMA_WORKERS) === true || input.ollamaEnabled === true || input.backend === 'ollama'
  const enabled = explicitDisable ? false : explicitEnable || stored.enabled === true
  const explicitProvider = firstText(process.env.SKS_LOCAL_LLM_PROVIDER, input.provider, input.backend === 'ollama' ? 'ollama' : '')
  const provider = explicitProvider ? normalizeProvider(explicitProvider) : normalizeProvider(stored.provider)
  const storedMatchesProvider = stored.provider === provider
  const model = firstText(process.env.SKS_LOCAL_LLM_MODEL, process.env.SKS_OLLAMA_MODEL, input.model, storedMatchesProvider ? stored.model : '', defaultModelForProvider(provider))
  const baseUrl = trimTrailingSlash(firstText(process.env.SKS_LOCAL_LLM_BASE_URL, process.env.SKS_OLLAMA_BASE_URL, input.baseUrl, storedMatchesProvider ? stored.base_url : '', defaultBaseUrlForProvider(provider)))
  const keepAlive = firstText(process.env.SKS_OLLAMA_KEEP_ALIVE, input.keepAlive, stored.keep_alive, DEFAULT_OLLAMA_KEEP_ALIVE)
  const timeoutMs = positiveNumber(process.env.SKS_OLLAMA_TIMEOUT_MS, input.timeoutMs, stored.timeout_ms, DEFAULT_OLLAMA_TIMEOUT_MS)
  const temperature = finiteNumber(process.env.SKS_OLLAMA_TEMPERATURE, input.temperature, stored.temperature, 0.1)
  const think = boolEnv(process.env.SKS_OLLAMA_THINK) ?? input.think ?? stored.think ?? DEFAULT_OLLAMA_THINK
  const status = enabled ? resolveEnabledStatus(stored) : 'disabled'
  const blockers = [
    ...(enabled ? [] : ['ollama_workers_disabled']),
    ...(enabled && status !== 'verified' ? [`local_llm_${status}`] : []),
    ...(!model ? ['local_model_missing'] : []),
    ...(!baseUrl ? ['local_model_base_url_missing'] : [])
  ]
  return {
    schema: OLLAMA_WORKER_CONFIG_SCHEMA,
    ok: blockers.length === 0,
    enabled,
    status,
    provider,
    model,
    base_url: baseUrl,
    endpoint: baseUrl,
    keep_alive: keepAlive,
    timeout_ms: timeoutMs,
    temperature,
    think,
    policy: stored.policy,
    capability: stored.capability,
    last_smoke: stored.last_smoke,
    config_path: localModelConfigPath(),
    explicit_disable: explicitDisable,
    explicit_enable: explicitEnable,
    blockers
  }
}

export function normalizeLocalModelConfig(raw: any = {}): LocalModelConfig {
  const enabled = raw.enabled === true
  const lastSmoke = normalizeSmoke(raw.last_smoke || raw.lastSmoke || null)
  const status = enabled ? normalizeStatus(raw.status, lastSmoke) : 'disabled'
  const provider = normalizeProvider(raw.provider)
  const baseUrl = trimTrailingSlash(firstText(raw.base_url, raw.baseUrl, raw.endpoint, defaultBaseUrlForProvider(provider)))
  return {
    schema: LOCAL_MODEL_CONFIG_SCHEMA_V2,
    ...(raw.generated_at ? { generated_at: String(raw.generated_at) } : { generated_at: nowIso() }),
    ...(raw.updated_at ? { updated_at: String(raw.updated_at) } : {}),
    enabled,
    status,
    provider,
    model: firstText(raw.model, defaultModelForProvider(provider)),
    endpoint: baseUrl,
    base_url: baseUrl,
    keep_alive: firstText(raw.keep_alive, raw.keepAlive, DEFAULT_OLLAMA_KEEP_ALIVE),
    timeout_ms: positiveNumber(raw.timeout_ms, raw.timeoutMs, DEFAULT_OLLAMA_TIMEOUT_MS),
    temperature: finiteNumber(raw.temperature, 0.1),
    think: typeof raw.think === 'boolean' ? raw.think : DEFAULT_OLLAMA_THINK,
    policy: normalizePolicy(raw.policy),
    capability: normalizeCapability(raw.capability),
    last_smoke: lastSmoke,
    blockers: Array.isArray(raw.blockers) ? raw.blockers.map(String) : status === 'blocked' ? ['local_llm_smoke_failed'] : []
  }
}

export function applyLocalLlmSmokeResult(config: LocalModelConfig, smoke: LocalModelSmokeResult): LocalModelConfig {
  const blockers = Array.isArray(smoke.blockers) ? smoke.blockers.map(String) : []
  const status: LocalModelStatus = smoke.skipped
    ? 'enabled_unverified'
    : smoke.ok && smoke.schema_valid !== false
      ? 'verified'
      : smoke.status === 'degraded'
        ? 'degraded'
        : 'blocked'
  return normalizeLocalModelConfig({
    ...config,
    enabled: true,
    status,
    capability: {
      ...config.capability,
      api_reachable: smoke.ok !== false,
      model_installed: smoke.ok !== false
    },
    last_smoke: {
      ...smoke,
      status
    },
    blockers
  })
}

export function localModelSmokeFresh(smoke: LocalModelSmokeResult | null, now = Date.now()) {
  if (!smoke?.ok || smoke.schema_valid === false || !smoke.ran_at) return false
  const ranAt = Date.parse(smoke.ran_at)
  return Number.isFinite(ranAt) && now - ranAt <= LOCAL_LLM_SMOKE_TTL_MS
}

export function boolEnv(value: unknown): boolean | null {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text) return null
  if (['1', 'true', 'on', 'yes', 'enable', 'enabled'].includes(text)) return true
  if (['0', 'false', 'off', 'no', 'disable', 'disabled'].includes(text)) return false
  return null
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

export function normalizeProvider(...values: unknown[]): LocalModelProvider {
  for (const value of values) {
    const text = String(value ?? '').trim().toLowerCase()
    if (!text) continue
    if (['ollama'].includes(text)) return 'ollama'
    if (['mlx', 'mlx-lm', 'mlx_lm', 'mlxlm'].includes(text)) return 'mlx-lm'
    if (['openai-compatible', 'openai_compatible', 'openai', 'openai-compatible-local'].includes(text)) return 'openai-compatible'
  }
  return 'ollama'
}

export function defaultModelForProvider(provider: LocalModelProvider) {
  if (provider === 'mlx-lm') return DEFAULT_MLX_LM_MODEL
  if (provider === 'openai-compatible') return ''
  return DEFAULT_OLLAMA_CODER_MODEL
}

export function defaultBaseUrlForProvider(provider: LocalModelProvider) {
  if (provider === 'mlx-lm') return DEFAULT_MLX_LM_BASE_URL
  if (provider === 'openai-compatible') return ''
  return DEFAULT_OLLAMA_BASE_URL
}

function resolveEnabledStatus(config: LocalModelConfig): LocalModelStatus {
  if (config.status === 'verified' && !localModelSmokeFresh(config.last_smoke)) return 'enabled_unverified'
  return config.status === 'disabled' ? 'enabled_unverified' : config.status
}

function normalizeStatus(value: unknown, smoke: LocalModelSmokeResult | null): LocalModelStatus {
  const text = String(value ?? '').trim()
  const known = ['disabled', 'enabled_unverified', 'verified', 'degraded', 'blocked']
  if (known.includes(text)) {
    if (text === 'verified' && !localModelSmokeFresh(smoke)) return 'enabled_unverified'
    return text as LocalModelStatus
  }
  return localModelSmokeFresh(smoke) ? 'verified' : 'enabled_unverified'
}

function normalizePolicy(value: any): LocalModelConfig['policy'] {
  const defaultAllowed = ['simple_patch_envelope', 'read_only_collection', 'grep_like_qa', 'test_generation_draft']
  const allowed = [
    ...defaultAllowed,
    ...(Array.isArray(value?.allowed_task_classes) ? value.allowed_task_classes : []),
    ...(Array.isArray(value?.allowed_work) ? value.allowed_work : [])
  ]
  const forbidden = Array.isArray(value?.forbidden_task_classes) ? value.forbidden_task_classes : [
    'planning',
    'strategy',
    'final_review',
    'verification_authority',
    'safety_authority',
    'integration_authority'
  ]
  return {
    role: 'worker_only',
    allowed_task_classes: [...new Set(allowed.map(String))],
    forbidden_task_classes: forbidden.map(String),
    requires_gpt_final: value?.requires_gpt_final !== false
  }
}

function normalizeCapability(value: any): LocalModelCapability {
  return {
    api_reachable: value?.api_reachable === true,
    model_installed: value?.model_installed === true,
    supports_streaming: value?.supports_streaming !== false,
    supports_json_schema: value?.supports_json_schema === true,
    supports_tools: value?.supports_tools === true,
    supports_images: value?.supports_images === true,
    context_window: positiveNumber(value?.context_window, 32768),
    max_parallel_requests: Math.max(1, Math.min(16, positiveNumber(value?.max_parallel_requests, 4)))
  }
}

function normalizeSmoke(value: any): LocalModelSmokeResult | null {
  if (!value || typeof value !== 'object') return null
  return {
    ok: value.ok === true,
    ...(value.skipped === true ? { skipped: true } : {}),
    ...(value.ran_at ? { ran_at: String(value.ran_at) } : {}),
    ...(value.prompt_hash ? { prompt_hash: String(value.prompt_hash) } : {}),
    ...(Number.isFinite(Number(value.latency_ms)) ? { latency_ms: Number(value.latency_ms) } : {}),
    ...(Number.isFinite(Number(value.tokens_per_second)) ? { tokens_per_second: Number(value.tokens_per_second) } : {}),
    ...(typeof value.schema_valid === 'boolean' ? { schema_valid: value.schema_valid } : {}),
    ...(value.result_path ? { result_path: String(value.result_path) } : {}),
    ...(normalizeKnownStatus(value.status) ? { status: normalizeKnownStatus(value.status) as LocalModelStatus } : {}),
    ...(value.reason ? { reason: String(value.reason) } : {}),
    ...(Array.isArray(value.blockers) ? { blockers: value.blockers.map(String) } : {})
  }
}

function normalizeKnownStatus(value: unknown): LocalModelStatus | undefined {
  const text = String(value ?? '').trim()
  return ['disabled', 'enabled_unverified', 'verified', 'degraded', 'blocked'].includes(text) ? text as LocalModelStatus : undefined
}

function positiveNumber(...values: unknown[]): number {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
  }
  return DEFAULT_OLLAMA_TIMEOUT_MS
}

function finiteNumber(...values: unknown[]): number {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return 0
}
