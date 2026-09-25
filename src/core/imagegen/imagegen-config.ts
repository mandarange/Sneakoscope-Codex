import os from 'node:os'
import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'

/**
 * Where SKS image generation goes.
 * - `codex` (default, also when no file exists): Codex's own image generation.
 *   SKS never pins an image model; Codex picks its current one.
 * - `openrouter`: every SKS image request goes through the SKS Desktop Bridge
 *   to the OpenRouter image model the user chose in SKS Control Center.
 */
export type ImagegenMode = 'codex' | 'openrouter'

export const IMAGEGEN_CONFIG_SCHEMA = 'sks.imagegen-config.v1' as const

export interface ImagegenConfig {
  schema: typeof IMAGEGEN_CONFIG_SCHEMA
  mode: ImagegenMode
  openrouter_model: string | null
  updated_at: string | null
}

/** The label SKS records when Codex's own image tool produced an output. */
export const CODEX_DEFAULT_IMAGEGEN_LABEL = 'codex-default' as const

export function imagegenConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(env.HOME || os.homedir(), '.sneakoscope', 'imagegen', 'config.json')
}

export function defaultImagegenConfig(): ImagegenConfig {
  return { schema: IMAGEGEN_CONFIG_SCHEMA, mode: 'codex', openrouter_model: null, updated_at: null }
}

/** OpenRouter ids look like `vendor/model` with an optional `:variant`. */
export function isOpenRouterModelId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(value) && value.length <= 160
}

export async function readImagegenConfig(env: NodeJS.ProcessEnv = process.env): Promise<ImagegenConfig> {
  const raw = await readJson<Partial<ImagegenConfig> | null>(imagegenConfigPath(env), null).catch(() => null)
  if (!raw || raw.schema !== IMAGEGEN_CONFIG_SCHEMA) return defaultImagegenConfig()
  const model = isOpenRouterModelId(raw.openrouter_model) ? raw.openrouter_model : null
  // An `openrouter` mode without a valid model falls back to Codex: a broken
  // file must never leave image generation pointing nowhere.
  const mode: ImagegenMode = raw.mode === 'openrouter' && model ? 'openrouter' : 'codex'
  return { schema: IMAGEGEN_CONFIG_SCHEMA, mode, openrouter_model: model, updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : null }
}

export async function writeImagegenConfig(
  update: { mode: ImagegenMode; openrouterModel?: string | null },
  env: NodeJS.ProcessEnv = process.env
): Promise<ImagegenConfig> {
  const current = await readImagegenConfig(env)
  const model = update.openrouterModel === undefined ? current.openrouter_model : update.openrouterModel
  if (update.mode === 'openrouter' && !isOpenRouterModelId(model)) throw new Error('imagegen_model_required')
  const next: ImagegenConfig = {
    schema: IMAGEGEN_CONFIG_SCHEMA,
    mode: update.mode,
    // Keep the last chosen model when switching back to Codex so turning the
    // custom mode on again restores it.
    openrouter_model: isOpenRouterModelId(model) ? model : null,
    updated_at: nowIso()
  }
  await writeJsonAtomic(imagegenConfigPath(env), next)
  return next
}

export interface ImagegenSelection {
  mode: ImagegenMode
  /** The model an output from this selection is recorded under. */
  model: string
  label: string
}

export function imagegenSelection(config: ImagegenConfig): ImagegenSelection {
  if (config.mode === 'openrouter' && config.openrouter_model) {
    return { mode: 'openrouter', model: config.openrouter_model, label: `OpenRouter ${config.openrouter_model} via SKS Desktop Bridge` }
  }
  return { mode: 'codex', model: CODEX_DEFAULT_IMAGEGEN_LABEL, label: 'Codex default image generation' }
}

export async function activeImagegenSelection(env: NodeJS.ProcessEnv = process.env): Promise<ImagegenSelection> {
  return imagegenSelection(await readImagegenConfig(env))
}
