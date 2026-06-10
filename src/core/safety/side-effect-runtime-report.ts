import fsp from 'node:fs/promises'
import path from 'node:path'
import { mutationLedgerPath, type MutationLedgerEntry } from './mutation-ledger.js'

export const SIDE_EFFECT_RUNTIME_REPORT_SCHEMA = 'sks.side-effect-runtime-report.v1'

export interface SideEffectRuntimeReport {
  schema: string
  ok: boolean
  generated_at: string
  ledger_paths: string[]
  total_entries: number
  applied_entries: number
  unexpected_applied_mutations: number
  global_mutations_without_confirmation: number
  config_mutations_without_backup_or_noop: number
  global_mutations: SideEffectRuntimeGlobalMutation[]
}

export interface SideEffectRuntimeGlobalMutation {
  route: string
  kind: MutationLedgerEntry['kind']
  target: string
  backup_path: string | null
  no_op_reason: string | null
  reason?: string
}

const GLOBAL_KINDS = new Set(['global_config_write', 'codex_app_flag_change', 'codex_lb_auth_change', 'skill_snapshot_promotion'])

export async function buildSideEffectRuntimeReport(root: string): Promise<SideEffectRuntimeReport> {
  const ledgerPaths = await discoverLedgerPaths(root)
  const entries = (await Promise.all(ledgerPaths.map(readLedger))).flat()
  const applied = entries.filter((entry) => entry.applied === true)
  const unexpected = applied.filter((entry) => (entry as any).violation === true || entry.requested_scope_allowed !== true)
  const globalMutations = applied.filter((entry) => GLOBAL_KINDS.has(entry.kind))
  const globalWithoutConfirmation = globalMutations.filter((entry) => entry.requested_scope_allowed !== true)
  const configWithoutBackup = globalMutations.filter((entry) => !entry.backup_path && !entry.no_op_reason)
  return {
    schema: SIDE_EFFECT_RUNTIME_REPORT_SCHEMA,
    ok: unexpected.length === 0 && globalWithoutConfirmation.length === 0 && configWithoutBackup.length === 0,
    generated_at: new Date().toISOString(),
    ledger_paths: ledgerPaths.map((file) => path.relative(root, file)),
    total_entries: entries.length,
    applied_entries: applied.length,
    unexpected_applied_mutations: unexpected.length,
    global_mutations_without_confirmation: globalWithoutConfirmation.length,
    config_mutations_without_backup_or_noop: configWithoutBackup.length,
    global_mutations: globalMutations.map((entry) => ({
      route: entry.route,
      kind: entry.kind,
      target: entry.target,
      backup_path: entry.backup_path ?? null,
      no_op_reason: entry.no_op_reason ?? null,
      ...(entry.reason ? { reason: entry.reason } : {})
    }))
  }
}

async function discoverLedgerPaths(root: string): Promise<string[]> {
  const found = new Set<string>()
  await addIfExists(found, mutationLedgerPath(root))
  await walkForLedgers(path.join(root, '.sneakoscope', 'missions'), found, {
    depth: 0,
    maxDepth: positiveInt(process.env.SKS_SIDE_EFFECT_LEDGER_SCAN_MAX_DEPTH, 6),
    visitedDirs: 0,
    maxDirs: positiveInt(process.env.SKS_SIDE_EFFECT_LEDGER_SCAN_MAX_DIRS, 20000)
  })
  return [...found].sort()
}

async function walkForLedgers(dir: string, found: Set<string>, budget: {
  depth: number
  maxDepth: number
  visitedDirs: number
  maxDirs: number
}): Promise<void> {
  if (budget.depth > budget.maxDepth || budget.visitedDirs >= budget.maxDirs) return
  budget.visitedDirs += 1
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory() && !shouldSkipLedgerScanDir(entry.name)) await walkForLedgers(file, found, { ...budget, depth: budget.depth + 1 })
    else if (entry.isFile() && entry.name === 'mutation-ledger.jsonl') found.add(file)
  }
}

function shouldSkipLedgerScanDir(name: string): boolean {
  return new Set(['node_modules', '.git', 'dist', 'vendor', '.next', 'coverage']).has(name)
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

async function addIfExists(found: Set<string>, file: string): Promise<void> {
  try {
    await fsp.access(file)
    found.add(file)
  } catch {}
}

async function readLedger(file: string): Promise<Array<MutationLedgerEntry & { violation?: boolean }>> {
  let text = ''
  try {
    text = await fsp.readFile(file, 'utf8')
  } catch {
    return []
  }
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as MutationLedgerEntry & { violation?: boolean }]
      } catch {
        return []
      }
    })
}
