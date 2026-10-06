import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { codexHomePath, inferProviderFromModel, normalizeCodexModelId, readTopLevelTomlString } from '../codex-app/codex-model-catalog.js'

// Codex writes this file ($CODEX_HOME/models_cache.json); SKS only reads it here.
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
 * Resolution reads the model list Codex itself uses: the `model_catalog_json`
 * file named in `$CODEX_HOME/config.toml` when there is one (the SKS bridge
 * serves Codex Desktop through it), else Codex's own models cache
 * (`$CODEX_HOME/models_cache.json`). The cache alone is not trusted when a
 * catalog is configured: any Codex client rewrites it with the models its own
 * version can see, so an older client leaves a shorter list than Codex Desktop
 * actually offers. Only `gpt-<version>-<family>` rows that Codex lists (not
 * hidden) count; the highest version wins, and a family preference breaks ties.
 * Without a usable list the built-in latest known family is used.
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

/** Families per tier, most specific first. */
const TIER_FAMILIES: Readonly<Record<ModelTier, readonly string[]>> = Object.freeze({
  fast: ['luna'],
  balanced: ['sol'],
  context: ['terra', 'sol'],
  deep: ['astra']
})

/**
 * Newest known models, used only when the Codex models cache is unavailable.
 * It is never written over a role file or default that already exists
 * (`catalogIsAuthoritative`): without the cache SKS cannot tell what is newer.
 */
export const BUILTIN_LATEST_TIER_MODELS: Readonly<Record<ModelTier, string>> = Object.freeze({
  fast: 'gpt-6-luna',
  balanced: 'gpt-6.1-sol',
  context: 'gpt-6.1-sol',
  deep: 'gpt-6-astra'
})

const MODEL_ID_RE = /^gpt-(\d+(?:\.\d+)*)-([a-z]+)$/

/** A `gpt-<version>-<family>` slug split into its numeric version and family; null for any other id. */
export function parseGptModelId(slug: unknown): { version: number[]; family: string } | null {
  const match = MODEL_ID_RE.exec(String(slug || '').trim())
  if (!match) return null
  return { version: String(match[1] || '0').split('.').map(Number), family: String(match[2] || '') }
}

export interface LatestModelTiers {
  readonly source: 'model_catalog' | 'models_cache' | 'builtin'
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

function fileKey(file: string): string {
  try {
    const stat = fs.statSync(file)
    return `${file}:${stat.mtimeMs}:${stat.size}`
  } catch {
    return `${file}:absent`
  }
}

function readableRows(file: string): CandidateRow[] {
  try {
    const stat = fs.statSync(file)
    return stat.isFile() && stat.size <= 16 * 1024 * 1024 ? readCandidateRows(file) : []
  } catch {
    return []
  }
}

let catalogPathMemo: { key: string; path: string | null } | null = null

/** The `model_catalog_json` file the user's Codex config names, resolved the way Codex resolves it. */
function configuredCatalogPath(input: { home?: string; env?: NodeJS.ProcessEnv }): string | null {
  const configPath = path.join(codexHomePath(input), 'config.toml')
  const key = fileKey(configPath)
  if (catalogPathMemo?.key === key) return catalogPathMemo.path
  let resolved: string | null = null
  try {
    const stat = fs.statSync(configPath)
    if (stat.isFile() && stat.size <= 4 * 1024 * 1024) {
      const value = readTopLevelTomlString(fs.readFileSync(configPath, 'utf8'), 'model_catalog_json')?.trim()
      if (value) {
        const env = input.env || process.env
        const home = input.home || env.HOME || os.homedir()
        resolved = value === '~' ? path.resolve(home)
          : value.startsWith('~/') ? path.resolve(home, value.slice(2))
            : path.isAbsolute(value) ? path.resolve(value)
              : path.resolve(path.dirname(configPath), value)
      }
    }
  } catch {
    resolved = null
  }
  catalogPathMemo = { key, path: resolved }
  return resolved
}

export function resolveLatestModelTiers(input: { home?: string; env?: NodeJS.ProcessEnv } = {}): LatestModelTiers {
  const cacheFile = modelsCachePath(input)
  const catalogFile = configuredCatalogPath(input)
  const key = `${fileKey(cacheFile)}|${catalogFile ? fileKey(catalogFile) : 'no-catalog'}`
  if (memo?.key === key) return memo.value
  const catalogRows = catalogFile ? readableRows(catalogFile) : []
  const useCatalog = catalogRows.length > 0
  const value = resolveFromRows(useCatalog ? catalogRows : readableRows(cacheFile), useCatalog ? 'model_catalog' : 'models_cache')
  memo = { key, value }
  return value
}

export function latestModelForTier(tier: ModelTier, input: { home?: string; env?: NodeJS.ProcessEnv } = {}): string {
  return resolveLatestModelTiers(input).models[tier]
}

/**
 * True when the tiers come from Codex's own models cache. Without it SKS only
 * knows its built-in ids, which may be older than what Codex lists, so a
 * writer must not replace an existing pin or default with them.
 */
export function catalogIsAuthoritative(input: { home?: string; env?: NodeJS.ProcessEnv } = {}): boolean {
  return resolveLatestModelTiers(input).source !== 'builtin'
}

/**
 * True when `model` is a tier-appropriate model at least as new as the tier's
 * current one: a family the tier uses and a version that is not older. Such a
 * model is never "stale", even when it is a different family than the one the
 * tier resolves to today (a context tier on terra 5.6 does not make a 6.1 sol
 * pin old).
 */
export function modelNotOlderForTier(model: unknown, tier: ModelTier, input: { home?: string; env?: NodeJS.ProcessEnv } = {}): boolean {
  const id = parseGptModelId(model)
  const current = parseGptModelId(resolveLatestModelTiers(input).models[tier])
  return Boolean(id && current && TIER_FAMILIES[tier].includes(id.family) && compareModelVersions(id.version, current.version) >= 0)
}

/** True when Codex lists a non-hidden row of the same family with a strictly higher version. */
export function supersededByNewerSameFamily(model: unknown, input: { home?: string; env?: NodeJS.ProcessEnv } = {}): boolean {
  const id = parseGptModelId(model)
  if (!id) return false
  return Object.keys(resolveLatestModelTiers(input).supported_efforts).some((slug) => {
    const other = parseGptModelId(slug)
    return other !== null && other.family === id.family && compareModelVersions(other.version, id.version) > 0
  })
}

/**
 * True when `model` is at least as new as SKS's built-in model for its tier.
 * Without the Codex cache SKS cannot call such a model stale, so a writer keeps
 * it; anything older than the built-in id is provably superseded.
 */
export function notOlderThanBuiltin(model: unknown): boolean {
  const id = parseGptModelId(model)
  const tier = modelTierForModel(model)
  const builtin = tier ? parseGptModelId(BUILTIN_LATEST_TIER_MODELS[tier]) : null
  return Boolean(id && builtin && compareModelVersions(id.version, builtin.version) >= 0)
}

/**
 * A short digest of the resolved tier models, or null without a usable cache.
 * It changes exactly when Codex lists a newer model for some tier, which is
 * when already-written role files and defaults need to follow.
 */
export function tierModelsFingerprint(input: { home?: string; env?: NodeJS.ProcessEnv } = {}): string | null {
  const resolved = resolveLatestModelTiers(input)
  if (resolved.source === 'builtin') return null
  const text = MODEL_TIERS.map((tier) => `${tier}=${resolved.models[tier]}`).join('\n')
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/** The models SKS children may use right now: the resolved latest model of every tier. */
export function latestTierModelSet(input: { home?: string; env?: NodeJS.ProcessEnv } = {}): Set<string> {
  return new Set(Object.values(resolveLatestModelTiers(input).models))
}

/** The tier a concrete model id belongs to by family, or null for other models. */
export function modelTierForModel(model: unknown): ModelTier | null {
  const family = parseGptModelId(model)?.family
  if (!family) return null
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

function readModelRows(file: string): Record<string, any>[] {
  let parsed: any
  try {
    const stat = fs.statSync(file)
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024) return []
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return []
  }
  const models = Array.isArray(parsed?.models) ? parsed.models : Array.isArray(parsed) ? parsed : []
  return models.slice(0, 1024).filter((row: unknown) => row && typeof row === 'object' && !Array.isArray(row))
}

function modelEfforts(row: Record<string, any>): string[] {
  return Array.isArray(row.supported_reasoning_levels)
    ? [...new Set<string>(row.supported_reasoning_levels
      .map((level: any) => String(typeof level === 'string' ? level : level?.effort || '').trim().toLowerCase())
      .filter(Boolean))]
    : []
}

function readCandidateRows(file: string): CandidateRow[] {
  const rows: CandidateRow[] = []
  for (const row of readModelRows(file)) {
    const slug = String(row.slug || row.model || row.id || '').trim()
    const id = parseGptModelId(slug)
    if (!id) continue
    const visibility = String(row.visibility || 'list').toLowerCase()
    if (visibility === 'hide' || visibility === 'hidden') continue
    const efforts = modelEfforts(row)
    rows.push({ slug, version: id.version, family: id.family, efforts })
  }
  return rows
}

export interface SelectableChildModel {
  public_id: string
  display_name: string
  reasoning_efforts: string[]
}

/**
 * Explicit child lists use models the selected connection actually advertises.
 * OAuth reads Codex's own cache; Codex-LB reads its configured bridge catalog.
 * A missing catalog yields no choices, never built-in or guessed model ids.
 */
export function selectableChildModels(
  profile: 'codex_lb' | 'openai',
  input: { home?: string; env?: NodeJS.ProcessEnv } = {}
): SelectableChildModel[] {
  const file = profile === 'codex_lb' ? configuredCatalogPath(input) : modelsCachePath(input)
  if (!file) return []
  const models: SelectableChildModel[] = []
  const seen = new Set<string>()
  for (const row of readModelRows(file)) {
    const model = normalizeCodexModelId(row.slug || row.public_id || row.model || row.id)
    const provider = String(row.provider_id || row.provider || inferProviderFromModel(model))
    if (!model || seen.has(model.toLowerCase()) || ['hide', 'hidden'].includes(String(row.visibility).toLowerCase())
      || row.multi_agent_version === 'disabled'
      || (profile === 'openai' && model.includes('/'))
      || provider !== (profile === 'codex_lb' ? 'codex-lb' : 'openai')) continue
    seen.add(model.toLowerCase())
    models.push({ public_id: model, display_name: String(row.display_name || model), reasoning_efforts: modelEfforts(row) })
  }
  const newest = new Map<string, number[]>()
  for (const row of models) {
    const id = parseGptModelId(row.public_id)
    if (id && (!newest.has(id.family) || compareModelVersions(id.version, newest.get(id.family)!) > 0)) newest.set(id.family, id.version)
  }
  return models.filter((row) => {
    const id = parseGptModelId(row.public_id)
    return !id || compareModelVersions(id.version, newest.get(id.family)!) === 0
  })
}

/** Numeric, segment-wise: 6.1 > 6 > 5.6 and 6.10 > 6.9. */
export function compareModelVersions(a: readonly number[], b: readonly number[]): number {
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function newestRow(rows: readonly CandidateRow[]): CandidateRow | null {
  return [...rows].sort((left, right) => compareModelVersions(right.version, left.version))[0] || null
}

function resolveFromRows(rows: readonly CandidateRow[], listSource: 'model_catalog' | 'models_cache'): LatestModelTiers {
  const models: Record<ModelTier, string> = { ...BUILTIN_LATEST_TIER_MODELS }
  // Efforts Codex lists for every GPT family row, not just the resolved ones,
  // so an explicit older model can still be validated against the catalog.
  const supported: Record<string, readonly string[]> = Object.fromEntries(rows.map((row) => [row.slug, row.efforts]))
  let fromCache = true
  for (const tier of MODEL_TIERS) {
    const families = TIER_FAMILIES[tier]
    const candidates = rows
      .filter((row) => families.includes(row.family))
      .sort((left, right) => compareModelVersions(right.version, left.version)
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
    source: fromCache && rows.length ? listSource : 'builtin',
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
