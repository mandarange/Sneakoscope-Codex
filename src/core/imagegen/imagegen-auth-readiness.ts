import os from 'node:os'
import path from 'node:path'
import { readText } from '../fsx.js'
import { codexAppGeneratedImagesDir } from '../image-ux-review/codex-app-generated-image-discovery.js'

// Auth-aware imagegen readiness. The codex-lb / ChatGPT-OAuth path drives the
// LLM (text) fine, but "the LLM works, therefore images must work" still does
// not hold: image generation needs a surface that actually exposes the
// `image_generation` tool. This module reports, per detected auth mode, whether
// a fully-headless generation path is available and the exact next action.

export const IMAGEGEN_AUTH_READINESS_SCHEMA = 'sks.imagegen-auth-readiness.v1'

export type ImagegenAuthMode = 'api_key' | 'chatgpt_oauth' | 'unknown'

export interface ImagegenAuthReadiness {
  schema: typeof IMAGEGEN_AUTH_READINESS_SCHEMA
  auth_mode: ImagegenAuthMode
  openai_api_key_present: boolean
  codex_app_builtin_available: boolean
  codex_app_generated_images_dir: string
  /** Single `sks` command produces an image with no manual GUI step. */
  headless_auto_available: boolean
  /** Ordered, currently-usable ways to produce a real gpt-image-2 image. */
  available_paths: string[]
  primary_blocker: string | null
  next_actions: string[]
}

export async function detectImagegenAuthMode(opts: { codexHome?: string; env?: NodeJS.ProcessEnv; authJsonText?: string } = {}): Promise<{ auth_mode: ImagegenAuthMode; openai_api_key_present: boolean }> {
  const env = opts.env || process.env
  const openaiApiKeyPresent = Boolean(env.OPENAI_API_KEY)
  const home = env.HOME || os.homedir()
  const codexHome = opts.codexHome || env.CODEX_HOME || path.join(home, '.codex')
  const authText = typeof opts.authJsonText === 'string'
    ? opts.authJsonText
    : await readText(path.join(codexHome, 'auth.json'), '').catch(() => '')
  let mode: ImagegenAuthMode = 'unknown'
  if (authText) {
    try {
      const parsed = JSON.parse(authText)
      const raw = String(parsed?.auth_mode || '').toLowerCase()
      if (raw.includes('chatgpt') || parsed?.tokens?.access_token) mode = 'chatgpt_oauth'
      else if (raw.includes('api') || parsed?.OPENAI_API_KEY) mode = 'api_key'
    } catch {
      // ignore malformed auth.json; fall through to key-based inference
    }
  }
  if (mode === 'unknown' && openaiApiKeyPresent) mode = 'api_key'
  return { auth_mode: mode, openai_api_key_present: openaiApiKeyPresent }
}

export async function evaluateImagegenAuthReadiness(opts: {
  codexHome?: string
  env?: NodeJS.ProcessEnv
  codexAppBuiltInAvailable?: boolean
  authJsonText?: string
} = {}): Promise<ImagegenAuthReadiness> {
  const env = opts.env || process.env
  const authModeOpts: { codexHome?: string; env: NodeJS.ProcessEnv; authJsonText?: string } = { env }
  if (opts.codexHome !== undefined) authModeOpts.codexHome = opts.codexHome
  if (opts.authJsonText !== undefined) authModeOpts.authJsonText = opts.authJsonText
  const { auth_mode, openai_api_key_present } = await detectImagegenAuthMode(authModeOpts)
  const codexAppBuiltInAvailable = opts.codexAppBuiltInAvailable === true
  const genDir = codexAppGeneratedImagesDir(opts.codexHome !== undefined ? { codexHome: opts.codexHome, env } : { env })

  // Fully-headless generation can happen through a direct OpenAI key or through
  // Codex built-in image_generation when the Codex feature surface exposes it.
  // Capability is not output proof; real smoke still must verify a file.
  const headlessAutoAvailable = openai_api_key_present || codexAppBuiltInAvailable

  const availablePaths: string[] = []
  if (openai_api_key_present) availablePaths.push('openai_api_key_headless')
  if (codexAppBuiltInAvailable) {
    availablePaths.push('codex_exec_builtin_image_generation')
    availablePaths.push('codex_app_gui_generated_images_autodiscovery')
  }

  const nextActions: string[] = []
  let primaryBlocker: string | null = null
  if (!availablePaths.length) {
    primaryBlocker = 'imagegen_no_usable_path'
    nextActions.push('Enable Codex built-in image_generation or generate the image in the Codex App ($imagegen/gpt-image-2); SKS auto-discovers the newest output from ' + genDir + '.')
    nextActions.push('Or set OPENAI_API_KEY to enable fully-headless single-command gpt-image-2 generation.')
  } else if (!headlessAutoAvailable) {
    primaryBlocker = 'imagegen_headless_auto_unavailable'
    nextActions.push('Use Codex App $imagegen/gpt-image-2 and rerun the SKS route, or set OPENAI_API_KEY for direct API image generation.')
  }

  return {
    schema: IMAGEGEN_AUTH_READINESS_SCHEMA,
    auth_mode,
    openai_api_key_present,
    codex_app_builtin_available: codexAppBuiltInAvailable,
    codex_app_generated_images_dir: genDir,
    headless_auto_available: headlessAutoAvailable,
    available_paths: availablePaths,
    primary_blocker: primaryBlocker,
    next_actions: nextActions
  }
}
