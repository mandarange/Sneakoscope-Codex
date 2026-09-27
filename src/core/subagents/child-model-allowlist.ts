import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { isOpenRouterModelId } from '../imagegen/imagegen-config.js'
import { latestTierModelSet } from './model-tiers.js'

/**
 * OpenRouter Only Mode and its subagent model list.
 *
 * One file, `~/.codex/sks/sks-openrouter-only.json`, is read by every
 * process that decides or carries a child model: the hooks inside Codex, the
 * Naruto runner, the bridge controller, and the launchd Desktop Bridge (at
 * start). While the mode is on, the main thread and every child run OpenRouter
 * models, and a child may only run a model on this list. Codex-LB mode (bridge
 * auth priority) and this mode are mutually exclusive; the bridge controller
 * flips one off when the other turns on.
 *
 * This module stays free of any path matching /openrouter/i so the Naruto
 * runner's import budget holds.
 */

export const OPENROUTER_ONLY_SCHEMA = 'sks.openrouter-only.v1' as const
export const OPENROUTER_ONLY_FILENAME = 'sks-openrouter-only.json'
/** Jev picks among at most 16 options per question. */
export const MAX_SUBAGENT_MODELS = 16
export const MAX_SUBAGENT_CRITERIA_CHARS = 240
export const SUBAGENT_MODEL_EFFORTS = ['low', 'medium', 'high', 'xhigh'] as const
export type SubagentModelEffort = typeof SUBAGENT_MODEL_EFFORTS[number]

export interface SubagentModelEntry {
  /** OpenRouter public id, `vendor/model[:variant]`, as the user wrote it. */
  model: string
  /** What Jev reads to decide when this model fits a child's work. */
  criteria: string
  /** Effort sent with the spawn; null lets Codex use the model default. */
  reasoning_effort: SubagentModelEffort | null
  /** Used when Jev is off, unavailable or unsure. Exactly one entry is default. */
  default: boolean
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

export interface OpenRouterOnlyLocation {
  home?: string
  env?: NodeJS.ProcessEnv
}

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

export function isSubagentModelEffort(value: unknown): value is SubagentModelEffort {
  return typeof value === 'string' && (SUBAGENT_MODEL_EFFORTS as readonly string[]).includes(value)
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
export function normalizeSubagentModelList(raw: unknown): { entries: SubagentModelEntry[]; issues: SubagentModelListIssue[] } {
  const rows = Array.isArray(raw) ? raw : []
  const issues: SubagentModelListIssue[] = []
  const entries: SubagentModelEntry[] = []
  const seen = new Set<string>()
  rows.forEach((row, index) => {
    const record = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    const model = String(record.model ?? '').trim()
    if (!isOpenRouterModelId(model)) {
      issues.push({ index, code: 'subagent_model_id_invalid' })
      return
    }
    const key = canonicalChildModelId(model)
    if (seen.has(key)) {
      issues.push({ index, code: 'subagent_model_duplicate' })
      return
    }
    const effort = record.reasoning_effort ?? null
    if (effort !== null && effort !== '' && !isSubagentModelEffort(effort)) {
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
      model: key,
      criteria: cleanCriteria(record.criteria),
      reasoning_effort: isSubagentModelEffort(effort) ? effort : null,
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

export async function readOpenRouterOnlyState(input: OpenRouterOnlyLocation = {}): Promise<OpenRouterOnlyState> {
  return readOpenRouterOnlyStateSync(input)
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

export function defaultSubagentEntry(state: OpenRouterOnlyState): SubagentModelEntry | null {
  return state.subagent_models.find((entry) => entry.default) || state.subagent_models[0] || null
}

export function subagentEntryForModel(state: OpenRouterOnlyState, model: unknown): SubagentModelEntry | null {
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
  | { mode: 'tiers'; models: string[]; entries: []; default_model: null }

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
