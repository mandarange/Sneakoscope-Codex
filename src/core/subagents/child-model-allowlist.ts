import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { isOpenRouterModelId } from '../imagegen/imagegen-config.js'
import { latestTierModelSet, selectableChildModels } from './model-tiers.js'
import { normalizeCodexModelId } from '../codex-app/codex-model-catalog.js'
import { withFileLock } from '../locks/file-lock.js'
import { ensureConfinedDirectory, inspectConfinedPath } from '../managed-path-safety.js'

/**
 * The shared child-model list authority for all connection modes.
 *
 * One file, `~/.codex/sks/sks-openrouter-only.json`, is read by every
 * process that decides or carries a child model: the hooks inside Codex, the
 * Naruto runner, the bridge controller, and the launchd Desktop Bridge (at
 * start). While the mode is on, the main thread and every child run OpenRouter
 * models, and a child may only run a model on this list. Codex-LB mode (bridge
 * auth priority) and this mode are mutually exclusive; the bridge controller
 * flips one off when the other turns on.
 *
 * Codex-LB and OpenAI OAuth lists live separately in
 * `~/.codex/sks/sks-subagent-model-lists.json`. A nonempty list replaces tier
 * selection for that connection; clearing it restores automatic tiers. The
 * OpenRouter list remains in its original store and retains transport enforcement.
 *
 * This module stays free of any import path matching /openrouter/i so the Naruto
 * runner's import budget holds.
 */

export const OPENROUTER_ONLY_SCHEMA = 'sks.openrouter-only.v1' as const
export const OPENROUTER_ONLY_FILENAME = 'sks-openrouter-only.json'
/** Jev picks among at most 16 options per question. */
export const MAX_SUBAGENT_MODELS = 16
export const MAX_SUBAGENT_CRITERIA_CHARS = 240
export const SUBAGENT_MODEL_EFFORTS = ['low', 'medium', 'high', 'xhigh'] as const
export const NATIVE_SUBAGENT_MODEL_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const
export type SubagentModelEffort = typeof NATIVE_SUBAGENT_MODEL_EFFORTS[number]
export type NativeSubagentModelProfile = 'codex_lb' | 'openai'
export type SubagentModelProfile = 'openrouter_only' | NativeSubagentModelProfile
export const SUBAGENT_MODEL_LISTS_SCHEMA = 'sks.subagent-model-lists.v1' as const

export interface SubagentModelEntry {
  /** Exact public id from the selected connection's catalog. */
  model: string
  /** What Jev reads to decide when this model fits a child's work. */
  criteria: string
  /** Effort sent with the spawn; null lets Codex use the model default. */
  reasoning_effort: SubagentModelEffort | null
  /** Used when Jev is off, unavailable or unsure. Exactly one entry is default. */
  default: boolean
  /** Current catalog capabilities, added when resolving a native list, never stored. */
  supported_reasoning_efforts?: readonly string[]
}

export interface OpenRouterOnlyRestore {
  /** `model =` in ~/.codex/config.toml before SKS switched it (null: unset). */
  previous_model: string | null
  /** The value SKS wrote; restore happens only while config still names it. */
  applied_model: string | null
}

export interface OpenRouterOnlyState {
  schema: typeof OPENROUTER_ONLY_SCHEMA
  enabled: boolean
  subagent_models: SubagentModelEntry[]
  restore: OpenRouterOnlyRestore | null
  updated_at: string | null
}

export interface ChildModelLocation {
  home?: string
  env?: NodeJS.ProcessEnv
  /** Controller's already-read preference; hooks resolve the same persisted settings. */
  nativeProfile?: NativeSubagentModelProfile
}

export type OpenRouterOnlyLocation = ChildModelLocation

/**
 * Resolved from HOME like the bridge settings, never from CODEX_HOME: the
 * launchd bridge has no CODEX_HOME, so a CODEX_HOME-relative path would let
 * the hooks and the bridge read different files.
 */
export function openRouterOnlyStatePath(input: OpenRouterOnlyLocation = {}): string {
  const env = input.env || process.env
  return path.join(input.home || env.HOME || os.homedir(), '.codex', 'sks', OPENROUTER_ONLY_FILENAME)
}

export function defaultOpenRouterOnlyState(): OpenRouterOnlyState {
  return { schema: OPENROUTER_ONLY_SCHEMA, enabled: false, subagent_models: [], restore: null, updated_at: null }
}

/** Case-insensitive identity, matching the bridge's route-key canonicalization. */
export function canonicalChildModelId(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

export function isSubagentModelEffort(value: unknown, profile: SubagentModelProfile = 'openrouter_only'): value is SubagentModelEffort {
  const efforts = profile === 'openrouter_only' ? SUBAGENT_MODEL_EFFORTS : NATIVE_SUBAGENT_MODEL_EFFORTS
  return typeof value === 'string' && (efforts as readonly string[]).includes(value)
}

function cleanCriteria(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SUBAGENT_CRITERIA_CHARS)
}

export interface SubagentModelListIssue {
  index: number
  code: 'subagent_model_id_invalid' | 'subagent_model_duplicate' | 'subagent_model_effort_invalid' | 'subagent_model_list_too_long'
}

/**
 * Validate a list as the user submitted it. Rows are kept in order; the first
 * row marked default wins, and the first row becomes default when none is.
 */
export function normalizeSubagentModelList(raw: unknown, profile: SubagentModelProfile = 'openrouter_only'): { entries: SubagentModelEntry[]; issues: SubagentModelListIssue[] } {
  const rows = Array.isArray(raw) ? raw : []
  const issues: SubagentModelListIssue[] = []
  const entries: SubagentModelEntry[] = []
  const seen = new Set<string>()
  rows.forEach((row, index) => {
    const record = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    const model = String(record.model ?? '').trim()
    if (!(profile === 'openrouter_only' ? isOpenRouterModelId(model) : normalizeCodexModelId(model))) {
      issues.push({ index, code: 'subagent_model_id_invalid' })
      return
    }
    const key = canonicalChildModelId(model)
    if (seen.has(key)) {
      issues.push({ index, code: 'subagent_model_duplicate' })
      return
    }
    const effort = record.reasoning_effort ?? null
    if (effort !== null && effort !== '' && !isSubagentModelEffort(effort, profile)) {
      issues.push({ index, code: 'subagent_model_effort_invalid' })
      return
    }
    if (entries.length >= MAX_SUBAGENT_MODELS) {
      issues.push({ index, code: 'subagent_model_list_too_long' })
      return
    }
    seen.add(key)
    entries.push({
      // Codex matches a spawn model against catalog slugs exactly, and the
      // bridge catalog lowercases OpenRouter ids.
      model: profile === 'openrouter_only' ? key : model,
      criteria: cleanCriteria(record.criteria),
      reasoning_effort: isSubagentModelEffort(effort, profile) ? effort : null,
      default: record.default === true
    })
  })
  const firstDefault = entries.findIndex((entry) => entry.default)
  entries.forEach((entry, index) => { entry.default = index === (firstDefault === -1 ? 0 : firstDefault) })
  return { entries, issues }
}

function normalizeRestore(raw: unknown): OpenRouterOnlyRestore | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)
  return { previous_model: text(record.previous_model), applied_model: text(record.applied_model) }
}

/** A missing or damaged file reads as "off" with an empty list, never as on. */
export function normalizeOpenRouterOnlyState(raw: unknown): OpenRouterOnlyState {
  if (!raw || typeof raw !== 'object') return defaultOpenRouterOnlyState()
  const record = raw as Record<string, unknown>
  if (record.schema !== OPENROUTER_ONLY_SCHEMA) return defaultOpenRouterOnlyState()
  return {
    schema: OPENROUTER_ONLY_SCHEMA,
    enabled: record.enabled === true,
    subagent_models: normalizeSubagentModelList(record.subagent_models).entries,
    restore: normalizeRestore(record.restore),
    updated_at: typeof record.updated_at === 'string' ? record.updated_at : null
  }
}

/** Synchronous so the PreToolUse spawn gate can call it. */
export function readOpenRouterOnlyStateSync(input: OpenRouterOnlyLocation = {}): OpenRouterOnlyState {
  try {
    return normalizeOpenRouterOnlyState(JSON.parse(fs.readFileSync(openRouterOnlyStatePath(input), 'utf8')))
  } catch {
    return defaultOpenRouterOnlyState()
  }
}

export async function writeOpenRouterOnlyState(
  update: Partial<Pick<OpenRouterOnlyState, 'enabled' | 'subagent_models' | 'restore'>>,
  input: OpenRouterOnlyLocation = {}
): Promise<OpenRouterOnlyState> {
  const current = readOpenRouterOnlyStateSync(input)
  const next = normalizeOpenRouterOnlyState({
    ...current,
    ...update,
    schema: OPENROUTER_ONLY_SCHEMA,
    updated_at: nowIso()
  })
  await writeJsonAtomic(openRouterOnlyStatePath(input), next, { mode: 0o600 })
  return next
}

export function defaultSubagentEntry(state: Pick<OpenRouterOnlyState, 'subagent_models'>): SubagentModelEntry | null {
  return state.subagent_models.find((entry) => entry.default) || state.subagent_models[0] || null
}

export function subagentEntryForModel(state: Pick<OpenRouterOnlyState, 'subagent_models'>, model: unknown): SubagentModelEntry | null {
  const key = canonicalChildModelId(model)
  if (!key) return null
  return state.subagent_models.find((entry) => canonicalChildModelId(entry.model) === key) || null
}

export type ChildModelAllowlist =
  | {
    mode: 'openrouter_only'
    models: string[]
    entries: SubagentModelEntry[]
    default_model: string | null
    /** List models the bridge has no OpenRouter route for right now; never chosen. */
    unroutable?: string[]
  }
  | {
    mode: 'configured'
    profile: NativeSubagentModelProfile
    models: string[]
    entries: SubagentModelEntry[]
    default_model: string | null
    unroutable: string[]
    blockers: string[]
  }
  | { mode: 'tiers'; models: string[]; entries: []; default_model: null }

export type ListChildModelAllowlist = Exclude<ChildModelAllowlist, { mode: 'tiers' }>

export function childModelListProfile(list: ListChildModelAllowlist): SubagentModelProfile {
  return list.mode === 'openrouter_only' ? 'openrouter_only' : list.profile
}

export function childModelListLabel(list: ListChildModelAllowlist): string {
  return list.mode === 'openrouter_only' ? 'OpenRouter Only' : list.profile === 'codex_lb' ? 'Codex-LB' : 'OpenAI OAuth'
}

export function listChildModelEffort(entry: SubagentModelEntry, requested: unknown): SubagentModelEffort | null {
  const supported = entry.supported_reasoning_efforts ?? SUBAGENT_MODEL_EFFORTS
  const effort = entry.reasoning_effort || String(requested || '')
  return supported.includes(effort) && isSubagentModelEffort(effort, 'openai') ? effort : null
}

interface NativeSubagentModelStore {
  schema: typeof SUBAGENT_MODEL_LISTS_SCHEMA
  profiles: Record<NativeSubagentModelProfile, SubagentModelEntry[]>
  updated_at: string | null
}

export function subagentModelListsPath(input: OpenRouterOnlyLocation = {}): string {
  return path.join(path.dirname(openRouterOnlyStatePath(input)), 'sks-subagent-model-lists.json')
}

/** Same auth-priority source as the controller; OAuth needs no bridge installation. */
export function nativeSubagentModelProfile(input: OpenRouterOnlyLocation = {}): NativeSubagentModelProfile {
  if (input.nativeProfile) return input.nativeProfile
  const file = path.join(path.dirname(openRouterOnlyStatePath(input)), 'desktop-bridge-settings.json')
  try {
    if (fs.statSync(file).size > 4 * 1024 * 1024) return 'openai'
    return JSON.parse(fs.readFileSync(file, 'utf8'))?.auth_priority_enabled === true ? 'codex_lb' : 'openai'
  } catch {
    return 'openai'
  }
}

export function readNativeSubagentModelStore(input: OpenRouterOnlyLocation = {}): {
  path: string; store: NativeSubagentModelStore; blockers: string[]
} {
  const file = subagentModelListsPath(input)
  const empty: NativeSubagentModelStore = { schema: SUBAGENT_MODEL_LISTS_SCHEMA, profiles: { codex_lb: [], openai: [] }, updated_at: null }
  try {
    if (fs.statSync(file).size > 256 * 1024) throw new Error('oversized')
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (raw?.schema !== SUBAGENT_MODEL_LISTS_SCHEMA || !raw.profiles || Array.isArray(raw.profiles)) throw new Error('schema')
    for (const profile of ['codex_lb', 'openai'] as const) {
      if (!Array.isArray(raw.profiles[profile])) throw new Error('profile')
      const normalized = normalizeSubagentModelList(raw.profiles[profile], profile)
      if (normalized.issues.length) throw new Error('entries')
      empty.profiles[profile] = normalized.entries
    }
    empty.updated_at = typeof raw.updated_at === 'string' ? raw.updated_at : null
    return { path: file, store: empty, blockers: [] }
  } catch (error: any) {
    return { path: file, store: empty, blockers: error?.code === 'ENOENT' ? [] : ['subagent_model_lists_unreadable'] }
  }
}

export async function writeNativeSubagentModels(
  profile: NativeSubagentModelProfile,
  raw: unknown,
  input: OpenRouterOnlyLocation = {}
): Promise<void> {
  const { entries, issues } = normalizeSubagentModelList(raw, profile)
  if (!Array.isArray(raw) || issues.length) throw new Error('subagent_models_payload_invalid')
  const file = subagentModelListsPath(input)
  const root = path.dirname(path.dirname(file))
  await fsp.mkdir(root, { recursive: true })
  await ensureConfinedDirectory(root, path.dirname(file))
  await withFileLock({ lockPath: `${file}.lock`, timeoutMs: 5_000, staleMs: 30_000 }, async () => {
    if ((await inspectConfinedPath(root, file)).leafSymlink) throw new Error('subagent_model_lists_unsafe_path')
    const current = readNativeSubagentModelStore(input)
    if (current.blockers.length) throw new Error(current.blockers[0])
    await writeJsonAtomic(file, {
      ...current.store,
      profiles: { ...current.store.profiles, [profile]: entries },
      updated_at: nowIso()
    }, { mode: 0o600 })
  })
}

/**
 * OpenRouter routes the bridge policy holds, or null when the policy is
 * missing or holds none (then nothing is filtered). Read from HOME like the
 * store, so the hooks and the bridge agree.
 */
function openRouterRoutedModels(input: OpenRouterOnlyLocation): Set<string> | null {
  const env = input.env || process.env
  const file = path.join(input.home || env.HOME || os.homedir(), '.codex', 'sks', 'sks-bridge-route-policy.json')
  try {
    const routes = JSON.parse(fs.readFileSync(file, 'utf8'))?.model_routes
    if (!routes || typeof routes !== 'object') return null
    const routed = new Set<string>()
    for (const [key, route] of Object.entries(routes as Record<string, { provider_id?: unknown }>)) {
      if (route?.provider_id === 'openrouter') routed.add(canonicalChildModelId(key.replace(/^openrouter:/i, '')))
    }
    return routed.size ? routed : null
  } catch {
    return null
  }
}

/**
 * Only list entries the bridge can route may be chosen: Codex rejects a spawn
 * model missing from its catalog. When the default entry is unroutable the
 * first routable entry becomes the default, as the main-model switch does.
 */
export function routableSubagentState(state: OpenRouterOnlyState, input: OpenRouterOnlyLocation = {}): { state: OpenRouterOnlyState; unroutable: string[] } {
  const routed = openRouterRoutedModels(input)
  if (!routed) return { state, unroutable: [] }
  const keep = state.subagent_models.filter((entry) => routed.has(canonicalChildModelId(entry.model)))
  const unroutable = state.subagent_models.filter((entry) => !keep.includes(entry)).map((entry) => entry.model)
  if (!unroutable.length) return { state, unroutable }
  const preferred = keep.findIndex((entry) => entry.default)
  const entries = keep.map((entry, index) => ({ ...entry, default: index === (preferred === -1 ? 0 : preferred) }))
  return { state: { ...state, subagent_models: entries }, unroutable }
}

/**
 * The one answer to "which models may a child run?". Every spawn gate, plan,
 * prompt and fallback asks this instead of reading tier models directly, so
 * OpenRouter Only Mode cannot be bypassed by a path that still assumes tiers.
 */
export function effectiveChildModelAllowlist(input: OpenRouterOnlyLocation = {}): ChildModelAllowlist {
  const stored = readOpenRouterOnlyStateSync(input)
  if (stored.enabled) {
    const { state, unroutable } = routableSubagentState(stored, input)
    return {
      mode: 'openrouter_only',
      models: state.subagent_models.map((entry) => entry.model),
      entries: state.subagent_models,
      default_model: defaultSubagentEntry(state)?.model ?? null,
      unroutable
    }
  }
  const profile = nativeSubagentModelProfile(input)
  const saved = readNativeSubagentModelStore(input)
  const selected = saved.blockers.length ? [] : saved.store.profiles[profile]
  if (selected.length || saved.blockers.length) {
    const available = selectableChildModels(profile, input)
    const entries = selected.flatMap((entry) => {
      const model = available.find((row) => canonicalChildModelId(row.public_id) === canonicalChildModelId(entry.model))
      return model && (!entry.reasoning_effort || model.reasoning_efforts.includes(entry.reasoning_effort))
        ? [{ ...entry, model: model.public_id, supported_reasoning_efforts: model.reasoning_efforts }]
        : []
    })
    const preferred = entries.findIndex((entry) => entry.default)
    entries.forEach((entry, index) => { entry.default = index === (preferred < 0 ? 0 : preferred) })
    return {
      mode: 'configured', profile, models: entries.map((entry) => entry.model), entries,
      default_model: defaultSubagentEntry({ subagent_models: entries })?.model ?? null,
      unroutable: selected.filter((row) => !entries.some((entry) => canonicalChildModelId(entry.model) === canonicalChildModelId(row.model))).map((row) => row.model),
      blockers: saved.blockers
    }
  }
  return { mode: 'tiers', models: [...latestTierModelSet(input)], entries: [], default_model: null }
}

export function isAllowedChildModel(model: unknown, allowlist: ChildModelAllowlist): boolean {
  const key = canonicalChildModelId(model)
  if (!key) return false
  if (allowlist.mode === 'tiers') return allowlist.models.includes(String(model ?? '').trim())
  return allowlist.models.some((candidate) => canonicalChildModelId(candidate) === key)
}

/** The allowlist spelling of a model (list order and case), or null when off-list. */
export function allowlistedChildModel(model: unknown, allowlist: ChildModelAllowlist): string | null {
  const key = canonicalChildModelId(model)
  if (!key) return null
  return allowlist.models.find((candidate) => canonicalChildModelId(candidate) === key) ?? null
}
