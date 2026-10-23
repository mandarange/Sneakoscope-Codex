import fsp from 'node:fs/promises'
import path from 'node:path'
import { readText, writeTextAtomic } from '../fsx.js'
import { hasCodexLbProviderTable } from '../../cli/install-helpers-codex-lb-config.js'
import { hasSksManagedCodexConfigMarker, writeCodexConfigGuarded } from '../codex/codex-config-guard.js'
import { bridgeRouteIndexPath, combinedBridgeCatalogPath } from '../codex-lb/combined-catalog.js'
import { readActiveCombinedBridgeCatalog } from '../codex-lb/combined-catalog/persistence.js'
import { backupInvalidToml } from '../subagents/official-subagent-config.js'

/**
 * Model pins SKS wrote that outlived the model they name.
 *
 * Codex runs a role file's `model` over the spawn's, and a project config's
 * `model` over the user's picker choice. Older SKS wrote both: 4.x directive
 * roles (`sks-planner` …) and project configs pinned `model = "gpt-5.5"` with
 * `model_provider = "codex-lb"`, and no later release removed them — so
 * sessions kept starting on a model no Codex-LB account serves at the asked
 * tier, and Codex kept offering its migration notice for a model the user never
 * chose. Only SKS-owned files are touched; current managed roles are skipped,
 * because their body hash and stale-pin refresh (role-model-pins.ts) own them.
 * A model pin is removed when the active combined catalog does not list the
 * model, hides it, or marks it for upgrade. `model_provider = "codex-lb"` is
 * removed when no `[model_providers.codex-lb]` table defines that provider: the
 * managed setup defines none, so the bridge (which routes Codex-LB) is the only
 * path that works. A table means someone's own direct setup, which stays — as
 * repairManagedCodexLbClientSelection leaves it. A project config counts as
 * SKS-owned only on evidence other than that selection, because the ownership
 * predicate also accepts the codex-lb selection itself.
 */

export const MODEL_PIN_HYGIENE_SCHEMA = 'sks.model-pin-hygiene.v1'

/** 4.x directive roles, written before the managed-role manifest existed. */
const LEGACY_ROLE_NAMES = new Set(['sks-planner', 'sks-implementer', 'sks-explorer', 'sks-checker'])

type PinState = 'current' | 'superseded' | 'unlisted'

export interface ModelPinHygieneChange {
  file: string
  removed: string[]
  backup_path: string | null
}

export interface ModelPinHygieneReport {
  schema: typeof MODEL_PIN_HYGIENE_SCHEMA
  fix: boolean
  catalog_available: boolean
  changes: ModelPinHygieneChange[]
  /** Pins found and not removed: a report-only run, or a write that was refused. */
  remaining: ModelPinHygieneChange[]
  errors: string[]
}

type CatalogRow = { public_id?: unknown; slug?: unknown; visibility?: unknown; upgrade?: unknown }

async function catalogPinState(codexHome: string): Promise<((model: string) => PinState) | null> {
  const read = await readActiveCombinedBridgeCatalog(combinedBridgeCatalogPath(codexHome), bridgeRouteIndexPath(codexHome)).catch(() => null)
  if (!read?.ok) return null
  const rows = new Map<string, CatalogRow>()
  for (const row of read.catalog.models as readonly CatalogRow[]) {
    for (const id of [row.public_id, row.slug]) if (typeof id === 'string' && id) rows.set(id, row)
  }
  return (model) => {
    const row = rows.get(model)
    if (!row) return 'unlisted'
    const visibility = String(row.visibility || 'list').toLowerCase()
    const upgrade = row.upgrade && typeof row.upgrade === 'object' ? (row.upgrade as { model?: unknown }).model : null
    return visibility === 'hide' || visibility === 'hidden' || (typeof upgrade === 'string' && upgrade) ? 'superseded' : 'current'
  }
}

/** The top-level section: before the first table, and before a role's instructions. */
function topLevelEnd(lines: readonly string[]): number {
  const end = lines.findIndex((line) => /^\s*\[/.test(line) || /^\s*developer_instructions\s*=/.test(line))
  return end === -1 ? lines.length : end
}

/** The pin lines to drop from a file's top level, as `key = "value"` labels. */
function stalePinLines(
  text: string,
  pinState: ((model: string) => PinState) | null,
  codexLbProviderDefined: boolean
): { indexes: number[]; labels: string[] } {
  const lines = text.split('\n')
  const indexes: number[] = []
  const labels: string[] = []
  for (let index = 0; index < topLevelEnd(lines); index += 1) {
    const match = /^\s*(model|model_provider)\s*=\s*"([^"]*)"\s*(?:#.*)?$/.exec(lines[index] || '')
    if (!match) continue
    const [, key, value] = match as unknown as [string, string, string]
    const stale = key === 'model_provider'
      ? value === 'codex-lb' && !codexLbProviderDefined
      : pinState !== null && pinState(value) !== 'current'
    if (!stale) continue
    indexes.push(index)
    labels.push(`${key} = "${value}"`)
  }
  return { indexes, labels }
}

function withoutLines(text: string, indexes: readonly number[]): string {
  const drop = new Set(indexes)
  return text.split('\n').filter((_, index) => !drop.has(index)).join('\n')
}

const CODEX_LB_SELECTION_EVIDENCE = [
  /^\s*model_provider\s*=\s*["']codex-lb["']\s*(?:#.*)?$/,
  /^\s*\[model_providers\.(?:"codex-lb"|codex-lb)\]\s*(?:#.*)?$/
]

/** SKS ownership of a project config, proven by something other than its codex-lb selection. */
function sksOwnedProjectConfig(text: string): boolean {
  const withoutSelection = text.split('\n')
    .filter((line) => !CODEX_LB_SELECTION_EVIDENCE.some((pattern) => pattern.test(line)))
    .join('\n')
  return hasSksManagedCodexConfigMarker(withoutSelection)
}

function isLegacySksRole(file: string, text: string): boolean {
  // A current managed role carries its body hash; editing it would orphan it.
  if (/sks_managed_body_sha256/.test(text)) return false
  const name = /^\s*name\s*=\s*"([^"]+)"/m.exec(text)?.[1] ?? path.basename(file, '.toml')
  return /^\s*description\s*=\s*"SKS managed\b/m.test(text) || LEGACY_ROLE_NAMES.has(name)
}

async function regularFile(file: string): Promise<boolean> {
  const stat = await fsp.lstat(file).catch(() => null)
  return Boolean(stat?.isFile() && !stat.isSymbolicLink())
}

async function roleFiles(dir: string): Promise<string[]> {
  const entries = await fsp.readdir(dir).catch(() => [] as string[])
  return entries.filter((name) => name.endsWith('.toml')).sort().map((name) => path.join(dir, name))
}

export async function reconcileStaleSksModelPins(input: {
  root: string
  codexHome: string
  fix: boolean
}): Promise<ModelPinHygieneReport> {
  const root = path.resolve(input.root)
  const codexHome = path.resolve(input.codexHome)
  const pinState = await catalogPinState(codexHome)
  const report: ModelPinHygieneReport = {
    schema: MODEL_PIN_HYGIENE_SCHEMA,
    fix: input.fix,
    catalog_available: pinState !== null,
    changes: [],
    remaining: [],
    errors: []
  }
  // Codex resolves a role's or project's provider against every config layer,
  // so a table in the user or project config makes the selection loadable.
  const projectConfig = path.join(root, '.codex', 'config.toml')
  const projectText = projectConfig !== path.join(codexHome, 'config.toml') && await regularFile(projectConfig)
    ? await readText(projectConfig, '')
    : null
  const providerDefinedAbove = hasCodexLbProviderTable(await readText(path.join(codexHome, 'config.toml'), ''))
    || (projectText !== null && hasCodexLbProviderTable(projectText))
  const agentDirs = [...new Set([path.join(codexHome, 'agents'), path.join(root, '.codex', 'agents')])]
  for (const dir of agentDirs) {
    for (const file of await roleFiles(dir)) {
      if (!(await regularFile(file))) continue
      const text = await readText(file, '')
      if (!isLegacySksRole(file, text)) continue
      const pins = stalePinLines(text, pinState, providerDefinedAbove || hasCodexLbProviderTable(text))
      if (!pins.indexes.length) continue
      if (!input.fix) { report.remaining.push({ file, removed: pins.labels, backup_path: null }); continue }
      try {
        const backup = await backupInvalidToml(file, text, 'model-pin-hygiene')
        const mode = (await fsp.stat(file)).mode & 0o777
        await writeTextAtomic(file, withoutLines(text, pins.indexes), { mode })
        report.changes.push({ file, removed: pins.labels, backup_path: backup })
      } catch (error) {
        report.errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`)
        report.remaining.push({ file, removed: pins.labels, backup_path: null })
      }
    }
  }
  if (projectText !== null) {
    const text = projectText
    const pins = sksOwnedProjectConfig(text) ? stalePinLines(text, pinState, providerDefinedAbove) : { indexes: [], labels: [] }
    if (pins.indexes.length && !input.fix) report.remaining.push({ file: projectConfig, removed: pins.labels, backup_path: null })
    else if (pins.indexes.length) {
      const write = await writeCodexConfigGuarded({
        root,
        configPath: projectConfig,
        before: text,
        mutate: () => withoutLines(text, pins.indexes),
        cause: 'model-pin-hygiene',
        backupTag: 'model-pin-hygiene',
        verifyUnchangedBeforeWrite: true
      })
      if (write.ok) report.changes.push({ file: projectConfig, removed: pins.labels, backup_path: write.backup_path })
      else {
        report.errors.push(`${projectConfig}: ${write.status}`)
        report.remaining.push({ file: projectConfig, removed: pins.labels, backup_path: null })
      }
    }
  }
  return report
}
