import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, nowIso, readText, sha256, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import {
  codexHome,
  scanProjectLocalForbiddenKeys,
  snapshotCodexAppUiState
} from './codex-app-ui-state-snapshot.js'
import { assertCodexAppUiMutationAllowed } from './codex-app-ui-clobber-guard.js'

export const CODEX_APP_FAST_UI_REPAIR_SCHEMA = 'sks.codex-app-fast-ui-repair.v1'

const FAST_UI_TOP_LEVEL_RE = /^\s*service_tier\s*=/
const FAST_UI_FEATURE_LINE_RE = /^\s*fast_mode\s*=/
const FAST_UI_USER_TABLE_LINE_RE = /^\s*(enabled|visible|locked|hidden|disabled)\s*=/
const SKS_CAUSED_RE = /(?:SKS|Sneakoscope|codex-lb|sks-mad|sks fast)/i

export async function repairCodexAppFastUi(root: string = process.cwd(), input: {
  codexHome?: string | null
  apply?: boolean
  force?: boolean
  reportPath?: string | null
} = {}) {
  const resolvedRoot = path.resolve(root)
  const home = codexHome(input.codexHome === undefined ? {} : { codexHome: input.codexHome })
  const before = await snapshotCodexAppUiState(resolvedRoot, { codexHome: home })
  const candidates = [
    { scope: 'project', file: path.join(resolvedRoot, '.codex', 'config.toml'), mode: 'project_forbidden_keys' },
    { scope: 'codex_home', file: path.join(home, 'config.toml'), mode: 'sks_caused_host_owned_keys' }
  ]
  const actions = []
  const detectedProjectLocalForbiddenKeys: string[] = []
  const unsafeReasons: string[] = []
  let detectedSksCausedMutation = false
  for (const candidate of candidates) {
    const text = await readText(candidate.file, null)
    if (text == null) {
      actions.push({ scope: candidate.scope, file: displayPath(candidate.file), status: 'missing', changed: false })
      continue
    }
    const repaired = candidate.mode === 'project_forbidden_keys'
      ? stripProjectLocalForbiddenKeys(text)
      : stripSksCausedHostOwnedLines(text)
    if (candidate.mode === 'project_forbidden_keys') detectedProjectLocalForbiddenKeys.push(...repaired.removedKeys)
    if (candidate.mode === 'sks_caused_host_owned_keys') {
      const unsafe = detectUnsafeFastUiRepair(text)
      unsafeReasons.push(...unsafe)
      if (repaired.text !== text) detectedSksCausedMutation = true
    }
    if (repaired.text === text) {
      actions.push({ scope: candidate.scope, file: displayPath(candidate.file), status: unsafeReasons.length && candidate.mode === 'sks_caused_host_owned_keys' ? 'requires_confirmation' : 'ok', changed: false, removed_keys: repaired.removedKeys })
      continue
    }
    const backupPath = `${candidate.file}.codex-app-ui-repair-${Date.now().toString(36)}.bak`
    if (input.apply) {
      await ensureDir(path.dirname(candidate.file))
      await fs.writeFile(backupPath, text, 'utf8')
      assertCodexAppUiMutationAllowed({ kind: 'codex_app_ui_state', scope: 'codex-app-ui-repair', backupPath })
      await writeTextAtomic(candidate.file, repaired.text)
    }
    actions.push({
      scope: candidate.scope,
      file: displayPath(candidate.file),
      status: input.apply ? 'repaired' : 'planned',
      changed: true,
      backup_path: input.apply ? displayPath(backupPath) : null,
      before_hash: sha256(text),
      after_hash: sha256(repaired.text),
      removed_keys: repaired.removedKeys
    })
  }
  const after = await snapshotCodexAppUiState(resolvedRoot, { codexHome: home })
  const changed = actions.some((action) => action.changed)
  const requiresConfirmation = unsafeReasons.length > 0 && input.force !== true
  const safeAutoApply = changed && !requiresConfirmation
  const manual = changed && !input.apply
  const blockers = [
    ...(requiresConfirmation ? ['codex_app_fast_ui_repair_requires_confirmation'] : []),
    ...(manual && !safeAutoApply ? ['codex_app_fast_ui_repair_requires_explicit_apply'] : []),
    ...(after.indicators.secret_leak_suspected ? ['codex_app_ui_repair_secret_leak_suspected'] : [])
  ]
  const report = {
    schema: CODEX_APP_FAST_UI_REPAIR_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    apply: input.apply === true,
    safe_auto_apply: safeAutoApply,
    requires_confirmation: requiresConfirmation,
    detected_sks_caused_mutation: detectedSksCausedMutation,
    detected_project_local_forbidden_keys: [...new Set(detectedProjectLocalForbiddenKeys)],
    unsafe_repair_reasons: [...new Set(unsafeReasons)],
    fast_selector: changed ? (input.apply ? 'repaired' : 'manual_action_required') : before.indicators.fast_selector === 'maybe_hidden_or_locked' ? 'manual_action_required' : 'ok',
    provider_selector: 'ok',
    host_owned_config: input.apply && changed ? 'repaired_with_backup' : changed ? 'preserved_until_explicit_apply' : 'preserved',
    actions,
    before_fast_selector: before.indicators.fast_selector,
    after_fast_selector: after.indicators.fast_selector,
    next_action: requiresConfirmation ? 'Run `sks doctor --fix --repair-codex-app-ui` after reviewing the repair plan.' : manual && safeAutoApply ? 'Run `sks doctor --fix` to apply the safe Codex App UI repair.' : manual ? 'Run `sks doctor --fix --repair-codex-app-ui` after reviewing the repair plan.' : changed ? 'Restart Codex App if the selector was already hidden.' : 'No Codex App UI repair needed.',
    blockers
  }
  if (input.reportPath) await writeJsonAtomic(input.reportPath, report)
  return report
}

function detectUnsafeFastUiRepair(text: string) {
  const reasons: string[] = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] || ''
    const serviceTier = line.match(/^\s*service_tier\s*=\s*"(standard|flex)"\s*(?:#.*)?$/i)?.[1]
    const sksMarked = SKS_CAUSED_RE.test(line) || SKS_CAUSED_RE.test(lines[i - 1] || '') || SKS_CAUSED_RE.test(lines[i + 1] || '')
    if (serviceTier && !sksMarked) reasons.push(`user_selected_service_tier_${serviceTier.toLowerCase()}`)
  }
  if (hasOddUnescapedQuotes(text)) reasons.push('unparseable_config_requires_manual_review')
  return [...new Set(reasons)]
}

function hasOddUnescapedQuotes(text: string) {
  return text.split(/\r?\n/).some((line) => {
    const stripped = line.replace(/\\"/g, '')
    return (stripped.match(/"/g) || []).length % 2 === 1
  })
}

function stripProjectLocalForbiddenKeys(text: string) {
  const forbidden = scanProjectLocalForbiddenKeys(text)
  if (!forbidden.length) return { text, removedKeys: [] as string[] }
  return stripMatchingLines(text, (line, table) => {
    if (table && forbidden.some((key) => key === table || key.startsWith(`${table}.`))) return true
    const key = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=/)?.[1]
    return Boolean(key && forbidden.includes(key))
  })
}

function stripSksCausedHostOwnedLines(text: string) {
  return stripMatchingLines(text, (line, table, previous, next) => {
    const isFastUiLine = FAST_UI_TOP_LEVEL_RE.test(line)
      || (table === 'features' && FAST_UI_FEATURE_LINE_RE.test(line))
      || (table === 'user.fast_mode' && FAST_UI_USER_TABLE_LINE_RE.test(line))
    return isFastUiLine && (SKS_CAUSED_RE.test(line) || SKS_CAUSED_RE.test(previous) || SKS_CAUSED_RE.test(next))
  })
}

function stripMatchingLines(text: string, shouldRemove: (line: string, table: string | null, previous: string, next: string) => boolean) {
  const lines = text.split(/\r?\n/)
  let table: string | null = null
  let removingTable: string | null = null
  const removedKeys: string[] = []
  const kept: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] || ''
    const tableMatch = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (tableMatch?.[1]) removingTable = null
    if (removingTable) {
      removedKeys.push(removingTable)
      continue
    }
    const currentTable = tableMatch?.[1] || table
    const remove = shouldRemove(line, currentTable, lines[i - 1] || '', lines[i + 1] || '')
    if (remove) {
      removedKeys.push(tableMatch?.[1] || line.match(/^\s*([A-Za-z0-9_.-]+)\s*=/)?.[1] || '<table-body>')
      if (tableMatch?.[1]) {
        table = null
        removingTable = tableMatch[1]
      }
      continue
    }
    kept.push(line)
    if (tableMatch?.[1]) table = tableMatch[1]
  }
  return { text: kept.join('\n'), removedKeys: [...new Set(removedKeys)] }
}

function displayPath(file: string) {
  return file.replace(process.env.HOME || '', '~')
}
