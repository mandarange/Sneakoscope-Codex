import os from 'node:os'
import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { OPENROUTER_CHAT_COMPLETIONS_URL } from '../providers/openrouter/openrouter-types.js'
import { redactOpenRouterString } from '../security/redact-secrets.js'

/**
 * OpenRouter image generation for the SKS custom image model mode, through
 * OpenRouter's Image API: `GET /api/v1/images/models` lists every image model
 * with the parameters it accepts, and `POST /api/v1/images` returns
 * `data[].b64_json`. Chat completions with `modalities` is only the fallback
 * for an endpoint that answers 404.
 */

export const OPENROUTER_IMAGE_MODELS_URL = 'https://openrouter.ai/api/v1/images/models' as const
export const OPENROUTER_IMAGES_URL = 'https://openrouter.ai/api/v1/images' as const
/** The general catalog, filtered to image output; used when the Image API list is unreachable. */
export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models?output_modalities=image' as const
export const OPENROUTER_IMAGE_MODELS_SCHEMA = 'sks.imagegen-openrouter-models.v1' as const
const MODEL_CACHE_VERSION = 2
const MODEL_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const MAX_IMAGE_BYTES = 40 * 1024 * 1024

/** Aspect ratios SKS asks for; each request is fitted to what the model accepts. */
export const OPENROUTER_ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const
export type OpenRouterAspectRatio = (typeof OPENROUTER_ASPECT_RATIOS)[number]

export function isOpenRouterAspectRatio(value: unknown): value is OpenRouterAspectRatio {
  return typeof value === 'string' && (OPENROUTER_ASPECT_RATIOS as readonly string[]).includes(value)
}

export interface OpenRouterImageModel {
  id: string
  name: string
  input_modalities: string[]
  output_modalities: string[]
  /** Accepted values the model reports; null when the catalog did not say. */
  aspect_ratios: string[] | null
  qualities: string[] | null
  output_formats: string[] | null
  /** Most reference images per request; 0 means the model cannot edit images. */
  max_references: number | null
  pricing: { prompt: string | null; completion: string | null; image: string | null }
  context_length: number | null
}

export interface OpenRouterImageModelList {
  schema: typeof OPENROUTER_IMAGE_MODELS_SCHEMA
  ok: boolean
  source: 'openrouter' | 'cache'
  fetched_at: string | null
  models: OpenRouterImageModel[]
  blockers: string[]
}

function modelCachePath(env: NodeJS.ProcessEnv): string {
  return path.join(env.HOME || os.homedir(), '.sneakoscope', 'imagegen', 'openrouter-image-models.json')
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((row): row is string => typeof row === 'string') : []
}

function priceText(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null
}

function enumValues(descriptor: any): string[] | null {
  return descriptor?.type === 'enum' ? strings(descriptor.values) : null
}

/**
 * Only models that emit images and name one concrete model. Router ids such
 * as `openrouter/auto` pick a model per request, so SKS could not say which
 * model made an image. Reads both the Image API list (`supported_parameters`)
 * and the general catalog (`pricing`).
 */
export function imageModelsFromCatalog(payload: unknown): OpenRouterImageModel[] {
  const rows = Array.isArray((payload as any)?.data) ? (payload as any).data : []
  const out: OpenRouterImageModel[] = []
  for (const row of rows) {
    const id = typeof row?.id === 'string' ? row.id : ''
    if (!id || id.startsWith('openrouter/')) continue
    const architecture = row?.architecture || {}
    const output = strings(architecture.output_modalities)
    if (!output.includes('image')) continue
    const input = strings(architecture.input_modalities)
    const params = row?.supported_parameters && typeof row.supported_parameters === 'object' && !Array.isArray(row.supported_parameters)
      ? row.supported_parameters
      : null
    const references = params?.input_references
    out.push({
      id,
      name: typeof row?.name === 'string' ? row.name : id,
      input_modalities: input,
      output_modalities: output,
      aspect_ratios: params ? enumValues(params.aspect_ratio) : null,
      qualities: params ? enumValues(params.quality) : null,
      output_formats: params ? enumValues(params.output_format) : null,
      max_references: params
        ? (references?.type === 'range' && Number.isFinite(references.max) ? Number(references.max) : 0)
        : (input.includes('image') ? null : 0),
      pricing: {
        prompt: priceText(row?.pricing?.prompt),
        completion: priceText(row?.pricing?.completion),
        image: priceText(row?.pricing?.image)
      },
      context_length: Number.isFinite(row?.context_length) ? Number(row.context_length) : null
    })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

async function readModelCache(env: NodeJS.ProcessEnv): Promise<{ fetched_at: string | null; models: OpenRouterImageModel[] } | null> {
  const cached = await readJson<{ version?: number; fetched_at?: string; models?: OpenRouterImageModel[] } | null>(modelCachePath(env), null).catch(() => null)
  if (cached?.version !== MODEL_CACHE_VERSION || !Array.isArray(cached.models)) return null
  return { fetched_at: typeof cached.fetched_at === 'string' ? cached.fetched_at : null, models: cached.models }
}

async function fetchCatalog(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<OpenRouterImageModel[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { 'X-OpenRouter-Title': 'Sneakoscope-Codex' } })
    if (!response.ok) throw new Error(`openrouter_models_http_${response.status}`)
    return imageModelsFromCatalog(await response.json())
  } finally {
    clearTimeout(timer)
  }
}

export async function listOpenRouterImageModels(opts: {
  env?: NodeJS.ProcessEnv
  refresh?: boolean
  fetchImpl?: typeof fetch
  timeoutMs?: number
} = {}): Promise<OpenRouterImageModelList> {
  const env = opts.env || process.env
  const cached = await readModelCache(env)
  const fresh = cached?.fetched_at && Date.now() - Date.parse(cached.fetched_at) < MODEL_CACHE_TTL_MS
  if (!opts.refresh && fresh && cached) {
    return { schema: OPENROUTER_IMAGE_MODELS_SCHEMA, ok: true, source: 'cache', fetched_at: cached.fetched_at, models: cached.models, blockers: [] }
  }
  const fetchImpl = opts.fetchImpl || fetch
  const timeoutMs = opts.timeoutMs ?? 15_000
  let failure: unknown = null
  for (const url of [OPENROUTER_IMAGE_MODELS_URL, OPENROUTER_MODELS_URL]) {
    try {
      const models = await fetchCatalog(url, fetchImpl, timeoutMs)
      if (!models.length) throw new Error('openrouter_models_empty')
      const fetchedAt = nowIso()
      await writeJsonAtomic(modelCachePath(env), { schema: OPENROUTER_IMAGE_MODELS_SCHEMA, version: MODEL_CACHE_VERSION, fetched_at: fetchedAt, models }).catch(() => undefined)
      return { schema: OPENROUTER_IMAGE_MODELS_SCHEMA, ok: true, source: 'openrouter', fetched_at: fetchedAt, models, blockers: [] }
    } catch (error: unknown) {
      failure ??= error
    }
  }
  // A stale cache still beats nothing when OpenRouter is unreachable.
  if (cached?.models.length) {
    return { schema: OPENROUTER_IMAGE_MODELS_SCHEMA, ok: true, source: 'cache', fetched_at: cached.fetched_at, models: cached.models, blockers: [] }
  }
  const reason = failure instanceof Error && /^openrouter_models_http_\d+$/.test(failure.message) ? failure.message : 'openrouter_models_unavailable'
  return { schema: OPENROUTER_IMAGE_MODELS_SCHEMA, ok: false, source: 'openrouter', fetched_at: null, models: [], blockers: [reason] }
}

/** What the model list last said about one model, without a network call. */
export async function cachedOpenRouterImageModel(model: string, env: NodeJS.ProcessEnv = process.env): Promise<OpenRouterImageModel | null> {
  return (await readModelCache(env))?.models.find((row) => row.id === model) || null
}

export interface ImageBytes {
  mime: string
  base64: string
}

export type OpenRouterImageResult =
  | { ok: true; model: string; images: ImageBytes[]; text: string; usage: { prompt_tokens: number | null; completion_tokens: number | null; cost: number | null }; warnings: string[] }
  | { ok: false; error: string; status: number | null }

function parseDataUrl(url: string): ImageBytes | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(url)
  if (!match) return null
  const base64 = match[2]!.replace(/\s+/g, '')
  if (Math.floor(base64.length * 3 / 4) > MAX_IMAGE_BYTES) return null
  return { mime: match[1]!.toLowerCase(), base64 }
}

async function imageFromUrl(url: string, fetchImpl: typeof fetch): Promise<ImageBytes | null> {
  const inline = parseDataUrl(url)
  if (inline) return inline
  if (!/^https:\/\//i.test(url)) return null
  const response = await fetchImpl(url).catch(() => null)
  if (!response?.ok) return null
  const mime = String(response.headers.get('content-type') || '').split(';')[0]!.trim().toLowerCase()
  if (!mime.startsWith('image/')) return null
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > MAX_IMAGE_BYTES) return null
  return { mime, base64: bytes.toString('base64') }
}

function ratioValue(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(value)
  return match ? Number(match[1]) / Number(match[2]) : null
}

/** The requested ratio when the model takes it, else the model's closest one, else none. */
export function fitAspectRatio(requested: string | null | undefined, supported: readonly string[] | null): string | null {
  const wanted = requested ? ratioValue(requested) : null
  if (!requested || wanted === null) return null
  if (!supported) return requested
  if (supported.includes(requested)) return requested
  let best: string | null = null
  let bestDistance = Infinity
  for (const option of supported) {
    const value = ratioValue(option)
    if (value === null) continue
    const distance = Math.abs(Math.log(value / wanted))
    if (distance < bestDistance) { best = option; bestDistance = distance }
  }
  return best
}

export function openRouterImagesRequestBody(input: {
  model: string
  prompt: string
  references?: readonly ImageBytes[]
  aspectRatio?: string | null
  quality?: string | null
  outputFormat?: string | null
}): Record<string, unknown> {
  const references = input.references || []
  return {
    model: input.model,
    prompt: input.prompt,
    n: 1,
    ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
    ...(input.quality ? { quality: input.quality } : {}),
    ...(input.outputFormat ? { output_format: input.outputFormat } : {}),
    ...(references.length ? { input_references: references.map((row) => ({ type: 'image_url', image_url: { url: `data:${row.mime};base64,${row.base64}` } })) } : {})
  }
}

/** The chat-completions form, for an Image API endpoint that answers 404. */
export function openRouterChatImageRequestBody(input: {
  model: string
  prompt: string
  references?: readonly ImageBytes[]
  aspectRatio?: string | null
  textOutput?: boolean
}): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: input.prompt }]
  for (const reference of input.references || []) {
    content.push({ type: 'image_url', image_url: { url: `data:${reference.mime};base64,${reference.base64}` } })
  }
  return {
    model: input.model,
    messages: [{ role: 'user', content }],
    modalities: input.textOutput === false ? ['image'] : ['image', 'text'],
    ...(input.aspectRatio ? { image_config: { aspect_ratio: input.aspectRatio } } : {})
  }
}

function usageOf(payload: any) {
  const usage = payload?.usage || {}
  return {
    prompt_tokens: Number.isFinite(usage.prompt_tokens) ? usage.prompt_tokens : null,
    completion_tokens: Number.isFinite(usage.completion_tokens) ? usage.completion_tokens : null,
    cost: Number.isFinite(usage.cost) ? usage.cost : null
  }
}

async function postJson(url: string, apiKey: string, body: unknown, fetchImpl: typeof fetch, signal: AbortSignal) {
  const response = await fetchImpl(url, {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-OpenRouter-Title': 'Sneakoscope-Codex' },
    body: JSON.stringify(body)
  })
  return { response, text: await response.text() }
}

function httpError(status: number, text: string) {
  const detail = redactOpenRouterString(text).slice(0, 300).replace(/\s+/g, ' ')
  return { ok: false as const, error: `openrouter_image_http_${status}${detail ? `:${detail}` : ''}`, status }
}

export async function generateOpenRouterImages(input: {
  apiKey: string
  model: string
  prompt: string
  references?: readonly ImageBytes[]
  aspectRatio?: string | null
  quality?: string | null
  /** png, jpeg or webp: sent only when the model lists it. */
  outputFormat?: string | null
  /** What the model list says about the model; read from the cache when omitted. */
  modelInfo?: OpenRouterImageModel | null
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  fetchImpl?: typeof fetch
  endpoint?: string
}): Promise<OpenRouterImageResult> {
  const fetchImpl = input.fetchImpl || fetch
  const info = input.modelInfo !== undefined ? input.modelInfo : await cachedOpenRouterImageModel(input.model, input.env).catch(() => null)
  const warnings: string[] = []
  let references = [...(input.references || [])]
  if (references.length && info?.max_references === 0) {
    return { ok: false, error: 'openrouter_model_takes_no_reference_images', status: null }
  }
  if (info?.max_references && references.length > info.max_references) {
    references = references.slice(0, info.max_references)
    warnings.push(`openrouter_references_trimmed:${info.max_references}`)
  }
  const aspectRatio = fitAspectRatio(input.aspectRatio, info?.aspect_ratios ?? null)
  if (input.aspectRatio && aspectRatio !== input.aspectRatio) warnings.push(`openrouter_aspect_ratio_fitted:${aspectRatio || 'model_default'}`)
  const quality = input.quality && info?.qualities?.includes(input.quality) ? input.quality : null
  const outputFormat = input.outputFormat && info?.output_formats?.includes(input.outputFormat) ? input.outputFormat : null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 180_000)
  try {
    const images = await postJson(input.endpoint || OPENROUTER_IMAGES_URL, input.apiKey,
      openRouterImagesRequestBody({ model: input.model, prompt: input.prompt, references, aspectRatio, quality, outputFormat }), fetchImpl, controller.signal)
    if (images.response.status !== 404) {
      if (!images.response.ok) return httpError(images.response.status, images.text)
      let payload: any
      try { payload = JSON.parse(images.text) } catch { return { ok: false, error: 'openrouter_image_response_invalid_json', status: images.response.status } }
      const out: ImageBytes[] = []
      for (const row of Array.isArray(payload?.data) ? payload.data : []) {
        const b64 = typeof row?.b64_json === 'string' ? row.b64_json.replace(/\s+/g, '') : ''
        const mime = typeof row?.media_type === 'string' && /^image\//.test(row.media_type) ? row.media_type.toLowerCase() : 'image/png'
        const image = b64 ? parseDataUrl(`data:${mime};base64,${b64}`) : typeof row?.url === 'string' ? await imageFromUrl(row.url, fetchImpl) : null
        if (image) out.push(image)
      }
      if (!out.length) return { ok: false, error: 'openrouter_image_missing', status: images.response.status }
      return { ok: true, model: typeof payload?.model === 'string' && payload.model ? payload.model : input.model, images: out, text: '', usage: usageOf(payload), warnings }
    }
    // No Image API at this endpoint: the chat-completions form still serves image models.
    const chat = await postJson(OPENROUTER_CHAT_COMPLETIONS_URL, input.apiKey,
      openRouterChatImageRequestBody({ model: input.model, prompt: input.prompt, references, aspectRatio, textOutput: info ? info.output_modalities.includes('text') : true }), fetchImpl, controller.signal)
    if (!chat.response.ok) return httpError(chat.response.status, chat.text)
    let payload: any
    try { payload = JSON.parse(chat.text) } catch { return { ok: false, error: 'openrouter_image_response_invalid_json', status: chat.response.status } }
    const message = payload?.choices?.[0]?.message || {}
    const out: ImageBytes[] = []
    for (const row of Array.isArray(message.images) ? message.images : []) {
      const url = typeof row?.image_url?.url === 'string' ? row.image_url.url : typeof row?.url === 'string' ? row.url : ''
      const image = url ? await imageFromUrl(url, fetchImpl) : null
      if (image) out.push(image)
    }
    if (!out.length) {
      const refusal = typeof message.content === 'string' ? redactOpenRouterString(message.content).slice(0, 200) : ''
      return { ok: false, error: `openrouter_image_missing${refusal ? `:${refusal}` : ''}`, status: chat.response.status }
    }
    return { ok: true, model: typeof payload?.model === 'string' && payload.model ? payload.model : input.model, images: out, text: typeof message.content === 'string' ? message.content : '', usage: usageOf(payload), warnings: [...warnings, 'openrouter_chat_completions_fallback'] }
  } catch (error: unknown) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    return { ok: false, error: aborted ? 'openrouter_image_timeout' : `openrouter_image_request_failed:${redactOpenRouterString(error instanceof Error ? error.message : String(error)).slice(0, 200)}`, status: null }
  } finally {
    clearTimeout(timer)
  }
}
