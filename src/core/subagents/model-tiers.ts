import fs from 'node:fs'
import path from 'node:path'
import { codexHomePath } from '../codex-app/codex-model-catalog.js'

// Same file as CODEX_MODELS_CACHE_FILENAME in codex-app/codex-models-cache.ts.
// That module loads the Codex runtime contract (and package.json) at import
// time; this one sits under skill install, so it stays free of that import.
const MODELS_CACHE_FILENAME = 'models_cache.json'

function modelsCachePath(input: { home?: string; env?: NodeJS.ProcessEnv }): string {
  return path.join(codexHomePath(input), MODELS_CACHE_FILENAME)
}

/**
 * Model tiers: SKS picks children by what the work needs — fast or accurate —
 * and always resolves each tier to the newest model Codex currently lists.
 * No model name is pinned. When Codex publishes a newer family, every tier
 * moves to it without an SKS release.
 *
 * Resolution reads Codex's own models cache (`$CODEX_HOME/models_cache.json`,
 * written by the Codex app/CLI from the backend). Only `gpt-<version>-<family>`
 * rows that Codex lists (not hidden) count; the highest version wins, and a
 * family preference breaks ties. Without a usable cache the built-in latest
 * known family is used.
 */

export type ModelTier = 'fast' | 'balanced' | 'context' | 'deep'
export type ModelTierEffort = 'low' | 'medium' | 'high' | 'max'

export const MODEL_TIERS: readonly ModelTier[] = Object.freeze(['fast', 'balanced', 'context', 'deep'])

export const MODEL_TIER_EFFORT: Readonly<Record<ModelTier, ModelTierEffort>> = Object.freeze({
  fast: 'low',
  balanced: 'low',
  context: 'medium',
  deep: 'max'
})

export const MODEL_TIER_SUMMARY: Readonly<Record<ModelTier, string>> = Object.freeze({
  fast: 'Fastest latest model. Mechanical edits, renames, formatting, and other one-step changes.',
  balanced: 'Fast latest model. Simple coding whose result is already specified.',
  context: 'Latest model at medium effort. Search, multi-file reading, broad exploration, and tool use.',
  deep: 'Most capable latest model. Judgment, architecture, ambiguity, security, or high-stakes work.'
})

/** Families per tier, most specific first. */
const TIER_FAMILIES: Readonly<Record<ModelTier, readonly string[]>> = Object.freeze({
  fast: ['luna'],
  balanced: ['sol'],
  context: ['terra', 'sol'],
  deep: ['astra']
})

/** Latest known family, used only when the Codex models cache is unavailable. */
export const BUILTIN_LATEST_TIER_MODELS: Readonly<Record<ModelTier, string>> = Object.freeze({
  fast: 'gpt-6-luna',
  balanced: 'gpt-6-sol',
  context: 'gpt-6-sol',
  deep: 'gpt-6-astra'
})

const MODEL_ID_RE = /^gpt-(\d+(?:\.\d+)*)-([a-z]+)$/

export interface LatestModelTiers {
  readonly source: 'models_cache' | 'builtin'
  readonly models: Readonly<Record<ModelTier, string>>
  readonly efforts: Readonly<Record<ModelTier, ModelTierEffort>>
  /** Reasoning efforts Codex lists per GPT model id; absent when unknown. */
  readonly supported_efforts: Readonly<Record<string, readonly string[]>>
}

interface CandidateRow {
  slug: string
  version: number[]
  family: string
  efforts: string[]
}

let memo: { key: string; value: LatestModelTiers } | null = null

/** Test seam: forget the memoized resolution. */
export function resetLatestModelTierCache(): void {
  memo = null
}

export function resolveLatestModelTiers(input: { home?: string; env?: NodeJS.ProcessEnv } = {}): LatestModelTiers {
  const file = modelsCachePath(input)
  let stat: fs.Stats | null = null
  try {
    stat = fs.statSync(file)
  } catch {
    stat = null
  }
  const key = stat ? `${file}:${stat.mtimeMs}:${stat.size}` : `${file}:absent`
  if (memo?.key === key) return memo.value
  const rows = stat && stat.isFile() && stat.size <= 16 * 1024 * 1024 ? readCandidateRows(file) : []
  const value = resolveFromRows(rows)
  memo = { key, value }
  return value
}

export function latestModelForTier(tier: ModelTier, input: { home?: string; env?: NodeJS.ProcessEnv } = {}): string {
  return resolveLatestModelTiers(input).models[tier]
}

/** The models SKS children may use right now: the resolved latest model of every tier. */
export function latestTierModelSet(input: { home?: string; env?: NodeJS.ProcessEnv } = {}): Set<string> {
  return new Set(Object.values(resolveLatestModelTiers(input).models))
}

export function isModelTier(value: unknown): value is ModelTier {
  return typeof value === 'string' && (MODEL_TIERS as readonly string[]).includes(value)
}

/** The tier a concrete model id belongs to by family, or null for other models. */
export function modelTierForModel(model: unknown): ModelTier | null {
  const match = MODEL_ID_RE.exec(String(model || '').trim())
  if (!match) return null
  const family = String(match[2] || '')
  for (const tier of MODEL_TIERS) {
    if (TIER_FAMILIES[tier][0] === family) return tier
  }
  return null
}

/**
 * The effort a tier runs at on its resolved model: the tier default when the
 * model lists it, otherwise the closest listed effort.
 */
export function effortForTier(tier: ModelTier, resolved: LatestModelTiers = resolveLatestModelTiers()): ModelTierEffort {
  const wanted = MODEL_TIER_EFFORT[tier]
  const supported = resolved.supported_efforts[resolved.models[tier]] || []
  if (!supported.length || supported.includes(wanted)) return wanted
  const order: ModelTierEffort[] = ['low', 'medium', 'high', 'max']
  const index = order.indexOf(wanted)
  const byDistance = [...order].sort((a, b) => Math.abs(order.indexOf(a) - index) - Math.abs(order.indexOf(b) - index))
  return byDistance.find((effort) => supported.includes(effort)) || wanted
}

function readCandidateRows(file: string): CandidateRow[] {
  let parsed: any
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return []
  }
  const models = Array.isArray(parsed?.models) ? parsed.models : Array.isArray(parsed) ? parsed : []
  const rows: CandidateRow[] = []
  for (const row of models.slice(0, 1024)) {
    if (!row || typeof row !== 'object') continue
    const slug = String(row.slug || row.model || row.id || '').trim()
    const match = MODEL_ID_RE.exec(slug)
    if (!match) continue
    const visibility = String(row.visibility || 'list').toLowerCase()
    if (visibility === 'hide' || visibility === 'hidden') continue
    const efforts = Array.isArray(row.supported_reasoning_levels)
      ? row.supported_reasoning_levels
        .map((level: any) => String(typeof level === 'string' ? level : level?.effort || '').trim().toLowerCase())
        .filter(Boolean)
      : []
    rows.push({ slug, version: String(match[1] || '0').split('.').map(Number), family: String(match[2] || ''), efforts })
  }
  return rows
}

function compareVersions(a: number[], b: number[]): number {
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function newestRow(rows: readonly CandidateRow[]): CandidateRow | null {
  return [...rows].sort((left, right) => compareVersions(right.version, left.version))[0] || null
}

function resolveFromRows(rows: readonly CandidateRow[]): LatestModelTiers {
  const models: Record<ModelTier, string> = { ...BUILTIN_LATEST_TIER_MODELS }
  // Efforts Codex lists for every GPT family row, not just the resolved ones,
  // so an explicit older model can still be validated against the catalog.
  const supported: Record<string, readonly string[]> = Object.fromEntries(rows.map((row) => [row.slug, row.efforts]))
  let fromCache = true
  for (const tier of MODEL_TIERS) {
    const families = TIER_FAMILIES[tier]
    const candidates = rows
      .filter((row) => families.includes(row.family))
      .sort((left, right) => compareVersions(right.version, left.version)
        || families.indexOf(left.family) - families.indexOf(right.family))
    // A cache without this tier's family falls back to the newest model the
    // cache does list, never to a built-in id the account may not have.
    const pick = candidates[0] || newestRow(rows)
    if (!pick) {
      fromCache = false
      continue
    }
    models[tier] = pick.slug
  }
  return Object.freeze({
    source: fromCache && rows.length ? 'models_cache' : 'builtin',
    models: Object.freeze(models),
    efforts: MODEL_TIER_EFFORT,
    supported_efforts: Object.freeze(supported)
  })
}

/** Reasoning efforts Codex lists for a model, or null when the catalog does not know it. */
export function codexListedEfforts(model: string, input: { home?: string; env?: NodeJS.ProcessEnv } = {}): readonly string[] | null {
  const efforts = resolveLatestModelTiers(input).supported_efforts[String(model || '').trim()]
  return efforts && efforts.length ? efforts : null
}
