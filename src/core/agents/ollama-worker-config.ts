import os from 'node:os'
import path from 'node:path'
import { ensureDir, exists, nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export const LOCAL_MODEL_CONFIG_SCHEMA = 'sks.local-model-config.v1'
export const OLLAMA_WORKER_CONFIG_SCHEMA = 'sks.ollama-worker-config.v1'
export const DEFAULT_OLLAMA_CODER_MODEL = 'rafw007/qwen36-a3b-claude-coder:q4_K_M'
export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
export const DEFAULT_OLLAMA_KEEP_ALIVE = '30m'
export const DEFAULT_OLLAMA_TIMEOUT_MS = 120_000
export const DEFAULT_OLLAMA_THINK = false

export interface LocalModelConfig {
  schema: typeof LOCAL_MODEL_CONFIG_SCHEMA
  generated_at?: string
  updated_at?: string
  enabled: boolean
  provider: 'ollama'
  model: string
  base_url: string
  keep_alive: string
  timeout_ms: number
  temperature: number
  think: boolean
  policy: {
    worker_only: true
    no_strategy_planning_design: true
    allowed_work: string[]
  }
}

export interface OllamaWorkerConfig {
  schema: typeof OLLAMA_WORKER_CONFIG_SCHEMA
  ok: boolean
  enabled: boolean
  provider: 'ollama'
  model: string
  base_url: string
  keep_alive: string
  timeout_ms: number
  temperature: number
  think: boolean
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
  const model = firstText(process.env.SKS_OLLAMA_MODEL, input.model, stored.model, DEFAULT_OLLAMA_CODER_MODEL)
  const baseUrl = trimTrailingSlash(firstText(process.env.SKS_OLLAMA_BASE_URL, input.baseUrl, stored.base_url, DEFAULT_OLLAMA_BASE_URL))
  const keepAlive = firstText(process.env.SKS_OLLAMA_KEEP_ALIVE, input.keepAlive, stored.keep_alive, DEFAULT_OLLAMA_KEEP_ALIVE)
  const timeoutMs = positiveNumber(process.env.SKS_OLLAMA_TIMEOUT_MS, input.timeoutMs, stored.timeout_ms, DEFAULT_OLLAMA_TIMEOUT_MS)
  const temperature = finiteNumber(process.env.SKS_OLLAMA_TEMPERATURE, input.temperature, stored.temperature, 0.1)
  const think = boolEnv(process.env.SKS_OLLAMA_THINK) ?? input.think ?? stored.think ?? DEFAULT_OLLAMA_THINK
  const blockers = [
    ...(enabled ? [] : ['ollama_workers_disabled']),
    ...(!model ? ['ollama_model_missing'] : []),
    ...(!baseUrl ? ['ollama_base_url_missing'] : [])
  ]
  return {
    schema: OLLAMA_WORKER_CONFIG_SCHEMA,
    ok: blockers.length === 0,
    enabled,
    provider: 'ollama',
    model,
    base_url: baseUrl,
    keep_alive: keepAlive,
    timeout_ms: timeoutMs,
    temperature,
    think,
    config_path: localModelConfigPath(),
    explicit_disable: explicitDisable,
    explicit_enable: explicitEnable,
    blockers
  }
}

export function normalizeLocalModelConfig(raw: any = {}): LocalModelConfig {
  return {
    schema: LOCAL_MODEL_CONFIG_SCHEMA,
    ...(raw.generated_at ? { generated_at: String(raw.generated_at) } : { generated_at: nowIso() }),
    ...(raw.updated_at ? { updated_at: String(raw.updated_at) } : {}),
    enabled: raw.enabled === true,
    provider: 'ollama',
    model: firstText(raw.model, DEFAULT_OLLAMA_CODER_MODEL),
    base_url: trimTrailingSlash(firstText(raw.base_url, raw.baseUrl, DEFAULT_OLLAMA_BASE_URL)),
    keep_alive: firstText(raw.keep_alive, raw.keepAlive, DEFAULT_OLLAMA_KEEP_ALIVE),
    timeout_ms: positiveNumber(raw.timeout_ms, raw.timeoutMs, DEFAULT_OLLAMA_TIMEOUT_MS),
    temperature: finiteNumber(raw.temperature, 0.1),
    think: typeof raw.think === 'boolean' ? raw.think : DEFAULT_OLLAMA_THINK,
    policy: {
      worker_only: true,
      no_strategy_planning_design: true,
      allowed_work: ['simple_code_patch_envelopes', 'read_only_collection']
    }
  }
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
