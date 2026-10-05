import path from 'node:path'
import { exists, readText } from '../fsx.js'
import { escapeRegExp } from '../text/regex.js'
import { safeWriteCodexConfigToml } from '../codex-runtime/codex-desktop-config-policy.js'
import { codexHomePath, codexUserConfigPath, readTopLevelTomlString } from './codex-model-catalog.js'
import { isCodexAppRunningByBundleId } from './menubar/config.js'
import { restartCodexApp } from './codex-app-restart.js'
import { maybeRestartRunningCodexApp, type CodexAppRestartOutcome } from './codex-app-restart-policy.js'

export const CODEX_CONTEXT_1M_SCHEMA = 'sks.codex-context-1m.v1'
// Inline marker: keeping ownership and the pre-enable value on the key line
// itself means the pair can never be separated by another writer, and the
// mode-lock provenance scan in codex-config-guard stops at these keys before
// it can misattribute the operator's `model` line to SKS.
export const CODEX_CONTEXT_1M_MARKER = 'sks-codex-context-1m'
export const CODEX_CONTEXT_1M_TARGETS = {
  model_context_window: 1_000_000,
  model_auto_compact_token_limit: 900_000
} as const
// The keys are global, but Codex caps them per model: the window becomes
// min(model_context_window, the model's max_context_window) and auto-compact
// stays at or below 90% of that window. Which models gain a larger window is
// therefore read from Codex's own model metadata, never from a pinned name.

export type CodexContext1mKey = keyof typeof CODEX_CONTEXT_1M_TARGETS
const MANAGED_KEYS = Object.keys(CODEX_CONTEXT_1M_TARGETS) as CodexContext1mKey[]

export interface CodexContext1mKeyState {
  present: boolean
  managed: boolean
  value: number | null
  previous: number | 'unset' | null
  duplicate: boolean
}

export interface CodexContext1mInspection {
  enabled: boolean
  model: string | null
  keys: Record<CodexContext1mKey, CodexContext1mKeyState>
  warnings: string[]
}

function topLevelRegionEnd(lines: string[]): number {
  const first = lines.findIndex((line) => /^\s*\[.+\]\s*$/.test(line))
  return first === -1 ? lines.length : first
}

function managedLine(key: CodexContext1mKey, previous: number | 'unset'): string {
  return `${key} = ${CODEX_CONTEXT_1M_TARGETS[key]} # ${CODEX_CONTEXT_1M_MARKER} prev=${previous}`
}

function inspectKeyLines(lines: string[], key: CodexContext1mKey): CodexContext1mKeyState & { lineIndex: number } {
  const end = topLevelRegionEnd(lines)
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`)
  const managedPattern = new RegExp(
    `^\\s*${escapeRegExp(key)}\\s*=\\s*(\\d+)\\s*#\\s*${escapeRegExp(CODEX_CONTEXT_1M_MARKER)}\\s+prev=(unset|\\d+)\\s*$`
  )
  const valuePattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(\\d+)\\s*(?:#.*)?$`)
  let state: (CodexContext1mKeyState & { lineIndex: number }) | null = null
  let duplicate = false
  for (let index = 0; index < end; index += 1) {
    const line = lines[index] || ''
    if (!keyPattern.test(line)) continue
    if (state) {
      duplicate = true
      continue
    }
    const managed = line.match(managedPattern)
    const value = line.match(valuePattern)
    state = {
      present: true,
      managed: Boolean(managed),
      value: managed ? Number(managed[1]) : value ? Number(value[1]) : null,
      previous: managed ? (managed[2] === 'unset' ? 'unset' : Number(managed[2])) : null,
      duplicate: false,
      lineIndex: index
    }
  }
  if (!state) return { present: false, managed: false, value: null, previous: null, duplicate: false, lineIndex: -1 }
  return { ...state, duplicate }
}

export function inspectCodexContext1m(text: string): CodexContext1mInspection {
  const lines = String(text || '').split('\n')
  const warnings: string[] = []
  const keys = {} as Record<CodexContext1mKey, CodexContext1mKeyState>
  for (const key of MANAGED_KEYS) {
    const { lineIndex: _lineIndex, ...state } = inspectKeyLines(lines, key)
    keys[key] = state
    if (state.duplicate) warnings.push(`codex_context_duplicate_key:${key}`)
    if (state.managed && state.value !== CODEX_CONTEXT_1M_TARGETS[key]) warnings.push(`codex_context_managed_value_drift:${key}`)
  }
  const enabled = MANAGED_KEYS.every((key) => keys[key].managed && keys[key].value === CODEX_CONTEXT_1M_TARGETS[key])
  return { enabled, model: readTopLevelTomlString(String(text || ''), 'model'), keys, warnings }
}

/** What the active model gets from Codex once the keys are on. */
export interface CodexContextModelWindow {
  source: 'codex_models_cache' | 'unknown'
  default_window: number | null
  max_window: number | null
  effective_window: number | null
  extends: boolean | null
}

interface CodexModelWindowRow {
  slug: string
  listed: boolean
  default_window: number | null
  max_window: number | null
}

function positiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

/** Context-window metadata per model from `$CODEX_HOME/models_cache.json`. */
export async function readCodexModelWindows(input: { env?: NodeJS.ProcessEnv; home?: string } = {}): Promise<CodexModelWindowRow[]> {
  const text = await readText(path.join(codexHomePath(input), 'models_cache.json'), '')
  let parsed: unknown = null
  try {
    parsed = JSON.parse(String(text || 'null'))
  } catch {
    return []
  }
  const models = (parsed as { models?: unknown } | null)?.models
  if (!Array.isArray(models)) return []
  return models.flatMap((row): CodexModelWindowRow[] => {
    if (!row || typeof row !== 'object') return []
    const record = row as Record<string, unknown>
    const slug = typeof record.slug === 'string' ? record.slug.trim() : ''
    if (!slug) return []
    return [{
      slug,
      listed: record.visibility !== 'hide',
      default_window: positiveInt(record.context_window),
      max_window: positiveInt(record.max_context_window)
    }]
  })
}

export function codexContextModelWindow(rows: readonly CodexModelWindowRow[], model: string | null): CodexContextModelWindow {
  const row = model ? rows.find((candidate) => candidate.slug === model) : undefined
  if (!row) return { source: 'unknown', default_window: null, max_window: null, effective_window: null, extends: null }
  const target = CODEX_CONTEXT_1M_TARGETS.model_context_window
  const effective = row.max_window === null ? target : Math.min(target, row.max_window)
  return {
    source: 'codex_models_cache',
    default_window: row.default_window,
    max_window: row.max_window,
    effective_window: effective,
    extends: row.default_window === null ? null : effective > row.default_window
  }
}

export interface CodexContext1mMutation {
  next: string
  changed: boolean
  previous: Partial<Record<CodexContext1mKey, number | 'unset'>>
  restored: Partial<Record<CodexContext1mKey, number | 'unset'>>
  blockers: string[]
  warnings: string[]
}

export function enableCodexContext1m(text: string): CodexContext1mMutation {
  const source = String(text || '')
  const lines = source.split('\n')
  const blockers: string[] = []
  const previous: Partial<Record<CodexContext1mKey, number | 'unset'>> = {}
  for (const key of MANAGED_KEYS) {
    const state = inspectKeyLines(lines, key)
    if (state.duplicate) blockers.push(`codex_context_duplicate_key:${key}`)
    if (state.present && !state.managed && state.value === null) blockers.push(`codex_context_unparseable_value:${key}`)
  }
  if (blockers.length) return { next: source, changed: false, previous: {}, restored: {}, blockers, warnings: [] }
  for (const key of MANAGED_KEYS) {
    const state = inspectKeyLines(lines, key)
    if (state.present) {
      const prior = state.managed ? (state.previous ?? 'unset') : (state.value as number)
      previous[key] = prior
      lines[state.lineIndex] = managedLine(key, prior)
    } else {
      previous[key] = 'unset'
      lines.splice(topLevelRegionEnd(lines), 0, managedLine(key, 'unset'))
    }
  }
  const next = lines.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n')
  return { next, changed: next !== source, previous, restored: {}, blockers: [], warnings: [] }
}

export function disableCodexContext1m(text: string): CodexContext1mMutation {
  const source = String(text || '')
  const lines = source.split('\n')
  const warnings: string[] = []
  const restored: Partial<Record<CodexContext1mKey, number | 'unset'>> = {}
  for (const key of MANAGED_KEYS) {
    const state = inspectKeyLines(lines, key)
    if (state.duplicate) {
      return { next: source, changed: false, previous: {}, restored: {}, blockers: [`codex_context_duplicate_key:${key}`], warnings: [] }
    }
    if (!state.present) continue
    if (!state.managed) {
      // A value SKS never wrote stays host-owned; disable never deletes it.
      warnings.push(`codex_context_unmanaged_key_left:${key}`)
      continue
    }
    const prior = state.previous ?? 'unset'
    restored[key] = prior
    if (prior === 'unset') lines.splice(state.lineIndex, 1)
    else lines[state.lineIndex] = `${key} = ${prior}`
  }
  const next = lines.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n')
  return { next, changed: next !== source, previous: {}, restored, blockers: [], warnings }
}

export type CodexContext1mAction = 'status' | 'on' | 'off'

export function normalizeCodexContext1mAction(value: unknown): CodexContext1mAction {
  const text = String(value || 'status').toLowerCase()
  if (['on', 'enable', 'enabled', '1m'].includes(text)) return 'on'
  if (['off', 'disable', 'disabled', 'default'].includes(text)) return 'off'
  return 'status'
}

export type CodexContext1mRestartOutcome = CodexAppRestartOutcome

export interface CodexContext1mCommandOptions {
  env?: NodeJS.ProcessEnv
  home?: string
  root?: string
  platform?: NodeJS.Platform
  isRunningImpl?: typeof isCodexAppRunningByBundleId
  restartImpl?: typeof restartCodexApp
}

export async function codexContext1mCommand(args: string[] = [], opts: CodexContext1mCommandOptions = {}) {
  const env = opts.env || process.env
  const action = normalizeCodexContext1mAction(args[0])
  const noRestart = args.includes('--no-restart')
  const configPath = codexUserConfigPath({ env, ...(opts.home ? { home: opts.home } : {}) })
  const before = String(await readText(configPath, ''))
  const fileExists = await exists(configPath)
  const blockers: string[] = []
  const warnings: string[] = []
  let write: Awaited<ReturnType<typeof safeWriteCodexConfigToml>> | null = null
  let changed = false
  let afterText = before
  let mutation: CodexContext1mMutation | null = null

  if (action === 'on' || action === 'off') {
    mutation = action === 'on' ? enableCodexContext1m(before) : disableCodexContext1m(before)
    blockers.push(...mutation.blockers)
    warnings.push(...mutation.warnings)
    if (!blockers.length && mutation.changed) {
      write = await safeWriteCodexConfigToml(configPath, before, mutation.next, 'codex-context-1m', {
        verifyUnchangedBeforeWrite: true,
        expectedBeforeExists: fileExists
      })
      if (!write.ok) {
        blockers.push(`codex_config_write_${write.status}`)
      } else {
        changed = write.changed
        afterText = write.expected_after?.text ?? mutation.next
      }
    }
  }

  const inspection = inspectCodexContext1m(afterText)
  warnings.push(...inspection.warnings)
  const windowRows = await readCodexModelWindows({ env, ...(opts.home ? { home: opts.home } : {}) })
  const modelWindow = codexContextModelWindow(windowRows, inspection.model)
  if (action === 'on' || inspection.enabled) {
    if (!inspection.model) warnings.push('codex_context_model_line_missing')
    else if (modelWindow.source === 'unknown') warnings.push(`codex_context_model_window_unknown:${inspection.model}`)
    else if (modelWindow.max_window === null) warnings.push(`codex_context_model_window_uncapped:${inspection.model}`)
    else if (modelWindow.extends === false) warnings.push(`codex_context_model_window_fixed:${inspection.model}:${modelWindow.max_window}`)
  }

  let restart: CodexContext1mRestartOutcome | null = null
  if ((action === 'on' || action === 'off') && !blockers.length) {
    restart = await maybeRestartRunningCodexApp({
      env,
      changed,
      noRestart,
      ...(opts.root === undefined ? {} : { root: opts.root }),
      ...(opts.platform === undefined ? {} : { platform: opts.platform }),
      ...(opts.isRunningImpl === undefined ? {} : { isRunningImpl: opts.isRunningImpl }),
      ...(opts.restartImpl === undefined ? {} : { restartImpl: opts.restartImpl })
    })
    if (restart.attempted && !restart.ok) warnings.push('codex_restart_failed_manual_restart_required')
  }

  return {
    schema: CODEX_CONTEXT_1M_SCHEMA,
    ok: blockers.length === 0,
    action,
    enabled: inspection.enabled,
    config_path: configPath,
    model: inspection.model,
    model_window: modelWindow,
    // Listed models whose Codex maximum is above their default window.
    larger_window_models: windowRows
      .filter((row) => row.listed && row.max_window !== null && row.default_window !== null && row.max_window > row.default_window)
      .map((row) => row.slug),
    target: { ...CODEX_CONTEXT_1M_TARGETS },
    keys: inspection.keys,
    previous: mutation && action === 'on' ? mutation.previous : null,
    restored: mutation && action === 'off' ? mutation.restored : null,
    changed,
    write: write ? { status: write.status, backup_path: write.backup_path } : null,
    restart,
    blockers,
    warnings,
    notes: [
      'Only new Codex sessions pick up context-window changes; existing conversations keep their previous limits.',
      'Codex caps the window at each model\'s maximum, so every model gets its largest supported window up to 1M.',
      'Requests with more than 272K input tokens are billed at the long-context rate (2x input / 1.5x output) for the entire request.'
    ],
    cli_commands: {
      status: 'sks codex-app context-1m status',
      on: 'sks codex-app context-1m on',
      off: 'sks codex-app context-1m off'
    }
  }
}
