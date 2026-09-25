import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { ensureDir, readText } from '../fsx.js'
import { parseResponsesSsePayload } from '../responses-stream.js'
import { resolveOpenRouterApiKey } from '../providers/openrouter/openrouter-secret-store.js'
import { bridgeClientUrl } from '../codex-lb/desktop-controller-v3/shared.js'
import { desktopBridgeServicePaths, readDesktopBridgeServiceSettings } from '../codex-lb/desktop-service.js'
import { DESKTOP_BRIDGE_IMAGEGEN_PATH } from '../codex-lb/desktop-bridge/types.js'
import { codexHomePath } from '../codex-app/codex-model-catalog.js'
import { CODEX_DEFAULT_IMAGEGEN_LABEL, readImagegenConfig, type ImagegenMode } from './imagegen-config.js'
import { generateOpenRouterImages, isOpenRouterAspectRatio, type ImageBytes } from './openrouter-images.js'
import {
  CODEX_BRIDGE_ROUTE_IMAGEGEN_EVIDENCE_CLASS,
  CODEX_BRIDGE_ROUTE_OUTPUT_SOURCE,
  SKS_CUSTOM_IMAGEGEN_EVIDENCE_CLASS,
  SKS_CUSTOM_IMAGEGEN_OUTPUT_SOURCE
} from './imagegen-evidence.js'

/**
 * The one SKS image generation entry point. Every SKS surface that makes an
 * image (the `sks imagegen generate` command, UX review callouts, PPT assets)
 * calls this, and it follows the mode set in SKS Control Center:
 *
 * - `openrouter`: the SKS Desktop Bridge calls the chosen OpenRouter image
 *   model (`/__sks/imagegen/generations`). If the running bridge predates that
 *   endpoint or is down, SKS calls OpenRouter directly with the same key.
 * - `codex`: the request goes through the bridge exactly like Codex's own
 *   image tool: the user's Codex model, routed by the bridge, with the hosted
 *   `image_generation` tool and no pinned image model.
 */

export const IMAGEGEN_GENERATE_SCHEMA = 'sks.imagegen-generate.v1' as const
const BRIDGE_TIMEOUT_MS = 240_000

export interface ImagegenGenerateInput {
  prompt: string
  /** Where to write the first image; later images get `-2`, `-3` suffixes. */
  outPath: string
  references?: readonly string[]
  aspectRatio?: string | null
  quality?: string | null
  env?: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
}

export interface ImagegenOutput {
  path: string
  sha256: string
  mime: string
  bytes: number
}

export interface ImagegenGenerateResult {
  schema: typeof IMAGEGEN_GENERATE_SCHEMA
  ok: boolean
  mode: ImagegenMode
  /** The model the output is recorded under. */
  model: string
  provider: 'openrouter' | 'codex-bridge-route'
  via: 'bridge' | 'direct' | null
  evidence_class: string | null
  output_source: string | null
  route_model: string | null
  outputs: ImagegenOutput[]
  usage: Record<string, unknown> | null
  blockers: string[]
  warnings: string[]
}

function mimeForPath(file: string): string {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'image/png'
}

/** The image format the output name asks for. */
function formatForPath(file: string): 'png' | 'jpeg' | 'webp' | null {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.png') return 'png'
  if (ext === '.jpg' || ext === '.jpeg') return 'jpeg'
  if (ext === '.webp') return 'webp'
  return null
}

function extensionForMime(mime: string): string {
  if (mime === 'image/jpeg') return '.jpg'
  if (mime === 'image/webp') return '.webp'
  if (mime === 'image/gif') return '.gif'
  return '.png'
}

async function readReferences(files: readonly string[]): Promise<ImageBytes[]> {
  const out: ImageBytes[] = []
  for (const file of files) {
    const bytes = await fsp.readFile(path.resolve(file))
    out.push({ mime: mimeForPath(file), base64: bytes.toString('base64') })
  }
  return out
}

/**
 * Write images next to `outPath`, keeping the caller's name for the first
 * one unless its extension names another format than the bytes: then the
 * real extension is used and a warning says so, so a JPEG is never a .png.
 */
async function writeOutputs(outPath: string, images: readonly ImageBytes[], warnings: string[]): Promise<ImagegenOutput[]> {
  const target = path.resolve(outPath)
  await ensureDir(path.dirname(target))
  const base = target.slice(0, target.length - path.extname(target).length)
  const outputs: ImagegenOutput[] = []
  for (const [index, image] of images.entries()) {
    const keepName = index === 0 && Boolean(path.extname(target)) && mimeForPath(target) === image.mime
    const file = keepName ? target : `${base}${index === 0 ? '' : `-${index + 1}`}${extensionForMime(image.mime)}`
    if (index === 0 && !keepName && path.extname(target)) warnings.push(`imagegen_output_extension_changed:${path.extname(file)}`)
    const bytes = Buffer.from(image.base64, 'base64')
    await fsp.writeFile(file, bytes)
    outputs.push({ path: file, sha256: createHash('sha256').update(bytes).digest('hex'), mime: image.mime, bytes: bytes.length })
  }
  return outputs
}

async function bridgeUrl(canonicalPath: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  const home = env.HOME || os.homedir()
  const settings = await readDesktopBridgeServiceSettings(desktopBridgeServicePaths(home).settings_path).catch(() => null)
  if (!settings?.listen_port) return null
  const host = settings.listen_host === '::1' ? '[::1]' : settings.listen_host
  return bridgeClientUrl(`http://${host}:${settings.listen_port}`, canonicalPath, { home, env } as any, settings.client_capability_sha256).catch(() => null)
}

async function postJson(url: string, body: unknown, fetchImpl: typeof fetch, timeoutMs: number, headers: Record<string, string> = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
    return { response, text: await response.text() }
  } finally {
    clearTimeout(timer)
  }
}

function result(partial: Partial<ImagegenGenerateResult> & Pick<ImagegenGenerateResult, 'mode' | 'model' | 'provider'>): ImagegenGenerateResult {
  return {
    schema: IMAGEGEN_GENERATE_SCHEMA,
    ok: false,
    via: null,
    evidence_class: null,
    output_source: null,
    route_model: null,
    outputs: [],
    usage: null,
    blockers: [],
    warnings: [],
    ...partial
  }
}

async function generateThroughOpenRouter(input: ImagegenGenerateInput, model: string, env: NodeJS.ProcessEnv): Promise<ImagegenGenerateResult> {
  const fetchImpl = input.fetchImpl || fetch
  const references = await readReferences(input.references || [])
  const aspectRatio = isOpenRouterAspectRatio(input.aspectRatio) ? input.aspectRatio : null
  const quality = ['low', 'medium', 'high'].includes(String(input.quality || '')) ? String(input.quality) : null
  const outputFormat = formatForPath(input.outPath)
  const warnings: string[] = []
  const base = { mode: 'openrouter' as const, model, provider: 'openrouter' as const }
  const url = await bridgeUrl(DESKTOP_BRIDGE_IMAGEGEN_PATH, env)
  if (url) {
    try {
      const { response, text } = await postJson(url, { prompt: input.prompt, model, references, ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}), ...(quality ? { quality } : {}), ...(outputFormat ? { output_format: outputFormat } : {}) }, fetchImpl, BRIDGE_TIMEOUT_MS)
      let payload: any = null
      try { payload = JSON.parse(text) } catch { payload = null }
      if (response.ok && payload?.ok === true && Array.isArray(payload.images) && payload.images.length) {
        const bridgeWarnings: string[] = Array.isArray(payload.warnings) ? payload.warnings.map(String) : []
        const outputs = await writeOutputs(input.outPath, payload.images, bridgeWarnings)
        return result({ ...base, ok: true, model: String(payload.model || model), via: 'bridge', evidence_class: SKS_CUSTOM_IMAGEGEN_EVIDENCE_CLASS, output_source: SKS_CUSTOM_IMAGEGEN_OUTPUT_SOURCE, outputs, usage: payload.usage || null, warnings: bridgeWarnings })
      }
      // A bridge that predates the endpoint (404) or has not reloaded the
      // mode yet falls through to the direct call; a real provider error is
      // the answer and is not retried elsewhere.
      if (payload?.error && !['imagegen_custom_mode_off', 'imagegen_model_not_selected'].includes(payload.error) && response.status !== 404) {
        return result({ ...base, via: 'bridge', blockers: [String(payload.error)] })
      }
      warnings.push(`bridge_imagegen_unavailable:${payload?.error || `http_${response.status}`}`)
    } catch (error: unknown) {
      warnings.push(`bridge_imagegen_unreachable:${error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'connect'}`)
    }
  } else {
    warnings.push('bridge_imagegen_unavailable:bridge_not_configured')
  }
  const key = await resolveOpenRouterApiKey({ env })
  if (!key.key) return result({ ...base, blockers: ['openrouter_key_missing'], warnings })
  const direct = await generateOpenRouterImages({ apiKey: key.key, model, prompt: input.prompt, references, aspectRatio, quality, outputFormat, env, fetchImpl })
  if (!direct.ok) return result({ ...base, via: 'direct', blockers: [direct.error], warnings })
  warnings.push(...direct.warnings)
  const outputs = await writeOutputs(input.outPath, direct.images, warnings)
  return result({ ...base, ok: true, model: direct.model, via: 'direct', evidence_class: SKS_CUSTOM_IMAGEGEN_EVIDENCE_CLASS, output_source: SKS_CUSTOM_IMAGEGEN_OUTPUT_SOURCE, outputs, usage: direct.usage, warnings })
}

/** The `model = "..."` line of the user's Codex config: the model Codex itself uses. */
export async function codexMainModel(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const text = String(await readText(path.join(codexHomePath({ env }), 'config.toml'), ''))
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) break
    const match = /^\s*model\s*=\s*"([^"]+)"/.exec(line)
    if (match?.[1]) return match[1]
  }
  return null
}

function imageFromResponses(payload: any): { b64: string; id: string | null } | null {
  for (const output of Array.isArray(payload?.output) ? payload.output : []) {
    if (String(output?.type || '') !== 'image_generation_call' || String(output?.status || '') === 'partial') continue
    const b64 = typeof output?.result === 'string' ? output.result : output?.result?.b64_json || output?.b64_json || null
    if (b64) return { b64: String(b64), id: output?.id || payload?.id || null }
  }
  return null
}

/** Codex's hosted tool takes three sizes; map an aspect ratio to the nearest. */
export function codexSizeForAspect(aspect: string | null | undefined): string | null {
  const match = /^(\d+):(\d+)$/.exec(String(aspect || ''))
  if (!match) return null
  const ratio = Number(match[1]) / Number(match[2])
  if (ratio > 1.15) return '1536x1024'
  if (ratio < 0.87) return '1024x1536'
  return '1024x1024'
}

function responsesError(payload: any, status: number): string {
  const code = payload?.error?.code || payload?.error?.type || payload?.code || ''
  if (status === 401 || status === 403) return 'codex_route_requires_codex_auth'
  return `codex_imagegen_http_${status}${code ? `:${String(code).slice(0, 80)}` : ''}`
}

async function generateThroughCodexRoute(input: ImagegenGenerateInput, env: NodeJS.ProcessEnv): Promise<ImagegenGenerateResult> {
  const fetchImpl = input.fetchImpl || fetch
  const routeModel = String(env.SKS_IMAGEGEN_RESPONSES_MODEL || '').trim() || await codexMainModel(env)
  const base = { mode: 'codex' as const, model: CODEX_DEFAULT_IMAGEGEN_LABEL, provider: 'codex-bridge-route' as const, route_model: routeModel }
  if (!routeModel) return result({ ...base, blockers: ['codex_main_model_missing'] })
  const url = await bridgeUrl('/backend-api/codex/responses', env)
  if (!url) return result({ ...base, blockers: ['desktop_bridge_not_configured'] })
  const references = await readReferences(input.references || [])
  const content: Array<Record<string, unknown>> = [{ type: 'input_text', text: input.prompt }]
  for (const reference of references) content.push({ type: 'input_image', image_url: `data:${reference.mime};base64,${reference.base64}` })
  const quality = ['low', 'medium', 'high', 'auto'].includes(String(input.quality || '')) ? { quality: input.quality } : {}
  const size = codexSizeForAspect(input.aspectRatio)
  const body = {
    model: routeModel,
    instructions: 'Generate the requested image with the image_generation tool. Do not answer with text only.',
    input: [{ role: 'user', content }],
    tools: [{ type: 'image_generation', ...(references.length ? { action: 'edit' } : {}), ...quality, ...(size ? { size } : {}) }],
    tool_choice: { type: 'image_generation' },
    stream: true,
    store: false
  }
  try {
    const { response, text } = await postJson(url, body, fetchImpl, BRIDGE_TIMEOUT_MS, { 'x-sks-model': routeModel })
    let payload: any = null
    try { payload = JSON.parse(text) } catch { payload = parseResponsesSsePayload(text) }
    if (!response.ok) return result({ ...base, via: 'bridge', blockers: [responsesError(payload, response.status)] })
    const image = imageFromResponses(payload)
    if (!image) return result({ ...base, via: 'bridge', blockers: [payload?.error ? responsesError(payload, 502) : 'codex_imagegen_output_missing'] })
    // The hosted tool reports no model; Codex decides it. Record the
    // Codex-default label rather than guessing an engine name.
    const warnings: string[] = []
    const outputs = await writeOutputs(input.outPath, [{ mime: 'image/png', base64: image.b64 }], warnings)
    return result({ ...base, ok: true, via: 'bridge', evidence_class: CODEX_BRIDGE_ROUTE_IMAGEGEN_EVIDENCE_CLASS, output_source: CODEX_BRIDGE_ROUTE_OUTPUT_SOURCE, outputs, usage: payload?.usage || null, warnings })
  } catch (error: unknown) {
    return result({ ...base, via: 'bridge', blockers: [error instanceof Error && error.name === 'AbortError' ? 'codex_imagegen_timeout' : 'desktop_bridge_unreachable'] })
  }
}

export const IMAGEGEN_SIDECAR_SCHEMA = 'sks.imagegen-output.v1' as const

/** Evidence written next to each image so ledgers can verify it without trusting prose. */
export function imagegenSidecarPath(imagePath: string): string {
  return `${path.resolve(imagePath)}.sks-imagegen.json`
}

export interface ImagegenSidecar {
  schema: typeof IMAGEGEN_SIDECAR_SCHEMA
  mode: ImagegenMode
  model: string
  provider: string
  via: string | null
  evidence_class: string
  output_source: string
  sha256: string
  mime: string
  bytes: number
  route_model: string | null
  created_at: string
}

async function writeSidecars(res: ImagegenGenerateResult): Promise<void> {
  if (!res.ok || !res.evidence_class || !res.output_source) return
  for (const output of res.outputs) {
    const sidecar: ImagegenSidecar = {
      schema: IMAGEGEN_SIDECAR_SCHEMA,
      mode: res.mode,
      model: res.model,
      provider: res.provider,
      via: res.via,
      evidence_class: res.evidence_class,
      output_source: res.output_source,
      sha256: output.sha256,
      mime: output.mime,
      bytes: output.bytes,
      route_model: res.route_model,
      created_at: new Date().toISOString()
    }
    await fsp.writeFile(imagegenSidecarPath(output.path), `${JSON.stringify(sidecar, null, 2)}\n`)
  }
}

/** The sidecar for an image, only when it still describes these exact bytes. */
export async function readImagegenSidecar(imagePath: string): Promise<ImagegenSidecar | null> {
  try {
    const sidecar = JSON.parse(await fsp.readFile(imagegenSidecarPath(imagePath), 'utf8')) as ImagegenSidecar
    if (sidecar?.schema !== IMAGEGEN_SIDECAR_SCHEMA) return null
    const bytes = await fsp.readFile(path.resolve(imagePath))
    return createHash('sha256').update(bytes).digest('hex') === sidecar.sha256 ? sidecar : null
  } catch {
    return null
  }
}

export async function generateSksImage(input: ImagegenGenerateInput): Promise<ImagegenGenerateResult> {
  const env = input.env || process.env
  const prompt = String(input.prompt || '').trim()
  const config = await readImagegenConfig(env)
  if (!prompt) {
    return result({ mode: config.mode, model: config.openrouter_model || CODEX_DEFAULT_IMAGEGEN_LABEL, provider: config.mode === 'openrouter' ? 'openrouter' : 'codex-bridge-route', blockers: ['imagegen_prompt_required'] })
  }
  const normalized = { ...input, prompt }
  const res = config.mode === 'openrouter' && config.openrouter_model
    ? await generateThroughOpenRouter(normalized, config.openrouter_model, env)
    : await generateThroughCodexRoute(normalized, env)
  await writeSidecars(res).catch(() => res.warnings.push('imagegen_sidecar_write_failed'))
  return res
}
