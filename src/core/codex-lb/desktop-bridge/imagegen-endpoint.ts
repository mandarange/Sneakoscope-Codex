import type { IncomingMessage, ServerResponse } from 'node:http'
import { readImagegenConfig, isOpenRouterModelId } from '../../imagegen/imagegen-config.js'
import { generateOpenRouterImages, type ImageBytes } from '../../imagegen/openrouter-images.js'
import { resolveOpenRouterApiKey } from '../../providers/openrouter/openrouter-secret-store.js'

/**
 * `POST /__sks/imagegen/generations` on the authenticated bridge path.
 *
 * Codex's own image tool runs inside the main Responses request on whatever
 * upstream serves the chat model, so the bridge cannot split it off. SKS's
 * custom image model mode therefore has its own endpoint: `sks imagegen
 * generate` (and every SKS image route) posts here, and the bridge calls the
 * OpenRouter image model chosen in Control Center with the OpenRouter key it
 * already holds. The key never leaves the bridge.
 */

export const DESKTOP_BRIDGE_IMAGEGEN_SCHEMA = 'sks.desktop-bridge-imagegen.v1' as const
const MAX_BODY_BYTES = 48 * 1024 * 1024
const MAX_REFERENCES = 8

class ImagegenEndpointError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code)
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new ImagegenEndpointError('imagegen_request_too_large', 413)
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function references(value: unknown): ImageBytes[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAX_REFERENCES) throw new ImagegenEndpointError('imagegen_references_invalid', 400)
  return value.map((row: any) => {
    const mime = typeof row?.mime === 'string' ? row.mime.toLowerCase() : ''
    const base64 = typeof row?.base64 === 'string' ? row.base64 : ''
    if (!/^image\/[a-z0-9.+-]+$/.test(mime) || !/^[A-Za-z0-9+/=]+$/.test(base64)) throw new ImagegenEndpointError('imagegen_references_invalid', 400)
    return { mime, base64 }
  })
}

function send(res: ServerResponse, status: number, payload: Record<string, unknown>): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', connection: 'close' })
  res.end(JSON.stringify({ schema: DESKTOP_BRIDGE_IMAGEGEN_SCHEMA, ...payload }))
}

export async function handleDesktopBridgeImagegen(
  req: IncomingMessage,
  res: ServerResponse,
  deps: { env?: NodeJS.ProcessEnv; generate?: typeof generateOpenRouterImages } = {}
): Promise<void> {
  const env = deps.env || process.env
  try {
    if (req.method !== 'POST') throw new ImagegenEndpointError('imagegen_method_not_allowed', 405)
    let body: any
    try {
      body = JSON.parse(await readBody(req))
    } catch (error) {
      if (error instanceof ImagegenEndpointError) throw error
      throw new ImagegenEndpointError('imagegen_request_invalid_json', 400)
    }
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt) throw new ImagegenEndpointError('imagegen_prompt_required', 400)
    const config = await readImagegenConfig(env)
    if (config.mode !== 'openrouter' || !config.openrouter_model) throw new ImagegenEndpointError('imagegen_custom_mode_off', 409)
    // The caller may only name the model the user chose; the bridge never
    // lets a request pick an arbitrary paid model.
    const requested = body?.model === undefined ? config.openrouter_model : body.model
    if (!isOpenRouterModelId(requested) || requested !== config.openrouter_model) throw new ImagegenEndpointError('imagegen_model_not_selected', 409)
    const key = await resolveOpenRouterApiKey({ env })
    if (!key.key) throw new ImagegenEndpointError('openrouter_key_missing', 424)
    const result = await (deps.generate || generateOpenRouterImages)({
      apiKey: key.key,
      model: requested,
      prompt,
      references: references(body?.references),
      aspectRatio: typeof body?.aspect_ratio === 'string' ? body.aspect_ratio : null,
      quality: typeof body?.quality === 'string' ? body.quality : null,
      outputFormat: typeof body?.output_format === 'string' ? body.output_format : null,
      env
    })
    if (!result.ok) {
      send(res, result.status && result.status >= 400 && result.status < 600 ? result.status : 502, { ok: false, error: result.error, model: requested })
      return
    }
    send(res, 200, { ok: true, model: result.model, requested_model: requested, images: result.images, text: result.text, usage: result.usage, warnings: result.warnings })
  } catch (error) {
    const code = error instanceof ImagegenEndpointError ? error.code : 'imagegen_bridge_failed'
    const status = error instanceof ImagegenEndpointError ? error.status : 500
    if (!res.headersSent) send(res, status, { ok: false, error: code })
    else res.destroy()
  }
}
