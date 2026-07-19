import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'smol-toml'
import { ensureDir, exists, PACKAGE_VERSION, readText, sha256, writeTextAtomic } from '../fsx.js'
import { ensureConfinedDirectory, inspectConfinedPath } from '../managed-path-safety.js'
import {
  MANAGED_OFFICIAL_SUBAGENT_ROLES,
  managedOfficialSubagentRoleContent,
  managedOfficialSubagentRoleOwnsText,
  type ManagedOfficialSubagentRole
} from '../managed-assets/managed-assets-manifest.js'

export const DEFAULT_OFFICIAL_SUBAGENT_MAX_THREADS = 12
export const DEFAULT_OFFICIAL_SUBAGENT_MAX_DEPTH = 1
export const DEFAULT_OFFICIAL_SUBAGENT_JOB_MAX_RUNTIME_SECONDS = 1200
export const DEFAULT_OFFICIAL_SUBAGENT_INTERRUPT_MESSAGE = true
export const LEGACY_SKS_MAX_THREAD_VALUES = Object.freeze([4, 5, 6])

export interface OfficialSubagentConfig {
  maxThreads: number
  maxDepth: number
  jobMaxRuntimeSeconds: number
  interruptMessage: boolean
  sources: {
    maxThreads: 'project' | 'global' | 'default'
    maxDepth: 'project' | 'global' | 'default'
    jobMaxRuntimeSeconds: 'project' | 'global' | 'default'
    interruptMessage: 'project' | 'global' | 'default'
  }
  projectConfigPath: string
  globalConfigPath: string | null
  blockers: string[]
  warnings: string[]
}

export interface OfficialSubagentConfigMergeOptions {
  sksOwned?: boolean
  inheritedText?: string
  defaultMaxThreads?: number
}

export interface OfficialSubagentConfigOwnershipProof {
  owned: boolean
  reasons: string[]
}

export interface OfficialSubagentAgentInstallResult {
  schema: 'sks.official-subagent-agent-install.v1'
  ok: boolean
  apply: boolean
  installed_agents: string[]
  missing: string[]
  existing: string[]
  stale: string[]
  created: string[]
  updated: string[]
  preserved: string[]
  invalid: string[]
  backups: string[]
  manual_blockers: string[]
  generated_files: string[]
}

/**
 * Merge the project-scoped Codex [agents] defaults without overriding explicit
 * project or inherited global values. Legacy 4/5/6 values migrate only when a
 * caller supplies concrete SKS ownership evidence (for example the generated
 * file inventory from the previous project manifest).
 */
export function mergeOfficialSubagentConfig(
  text: string = '',
  opts: OfficialSubagentConfigMergeOptions = {}
): string {
  const source = String(text || '')
  if (!inspectToml(source).ok) return source

  const inherited = parsedToml(opts.inheritedText || '')
  const inheritedAgents = objectValue(inherited?.agents)
  let next = source.trimEnd()
  if (!next.trim()) next = '# SKS-MANAGED-CODEX-CONFIG'
  if (opts.sksOwned === true) next = removeExactLegacyManagedAgentBlocks(next)
  const targetMaxThreads = positiveInteger(opts.defaultMaxThreads) || DEFAULT_OFFICIAL_SUBAGENT_MAX_THREADS
  const currentMaxThreads = readTomlTableInteger(next, 'agents', 'max_threads')

  if (!hasTomlTableKey(next, 'agents', 'max_threads')) {
    if (!hasOwn(inheritedAgents, 'max_threads')) {
      next = upsertTomlTableKey(next, 'agents', `max_threads = ${targetMaxThreads}`)
    }
  } else if (opts.sksOwned === true && LEGACY_SKS_MAX_THREAD_VALUES.includes(currentMaxThreads || 0)) {
    next = upsertTomlTableKey(next, 'agents', `max_threads = ${targetMaxThreads}`)
  }

  next = upsertDefaultUnlessInherited(next, inheritedAgents, 'max_depth', `max_depth = ${DEFAULT_OFFICIAL_SUBAGENT_MAX_DEPTH}`)
  next = upsertDefaultUnlessInherited(
    next,
    inheritedAgents,
    'job_max_runtime_seconds',
    `job_max_runtime_seconds = ${DEFAULT_OFFICIAL_SUBAGENT_JOB_MAX_RUNTIME_SECONDS}`
  )
  next = upsertDefaultUnlessInherited(
    next,
    inheritedAgents,
    'interrupt_message',
    `interrupt_message = ${DEFAULT_OFFICIAL_SUBAGENT_INTERRUPT_MESSAGE}`
  )

  const merged = ensureTrailingNewline(next)
  return inspectToml(merged).ok ? merged : source
}

export async function readOfficialSubagentConfig(
  root: string,
  opts: { home?: string; codexHome?: string; projectConfigPath?: string } = {}
): Promise<OfficialSubagentConfig> {
  const projectConfigPath = path.resolve(opts.projectConfigPath || path.join(root, '.codex', 'config.toml'))
  const home = opts.home || process.env.HOME || os.homedir()
  const codexHome = opts.codexHome || process.env.CODEX_HOME || path.join(home, '.codex')
  const candidateGlobalPath = path.resolve(codexHome, 'config.toml')
  const globalConfigPath = candidateGlobalPath === projectConfigPath ? null : candidateGlobalPath
  const projectText = await readText(projectConfigPath, '')
  const globalText = globalConfigPath ? await readText(globalConfigPath, '') : ''
  const projectLayer = configLayer(projectText, 'project')
  const globalLayer = configLayer(globalText, 'global')
  const blockers = [...projectLayer.blockers, ...globalLayer.blockers]

  const maxThreads = resolveLayeredValue(
    projectLayer.agents.max_threads,
    globalLayer.agents.max_threads,
    DEFAULT_OFFICIAL_SUBAGENT_MAX_THREADS,
    positiveInteger
  )
  const maxDepth = resolveLayeredValue(
    projectLayer.agents.max_depth,
    globalLayer.agents.max_depth,
    DEFAULT_OFFICIAL_SUBAGENT_MAX_DEPTH,
    positiveInteger
  )
  const jobMaxRuntimeSeconds = resolveLayeredValue(
    projectLayer.agents.job_max_runtime_seconds,
    globalLayer.agents.job_max_runtime_seconds,
    DEFAULT_OFFICIAL_SUBAGENT_JOB_MAX_RUNTIME_SECONDS,
    positiveInteger
  )
  const interruptMessage = resolveLayeredValue(
    projectLayer.agents.interrupt_message,
    globalLayer.agents.interrupt_message,
    DEFAULT_OFFICIAL_SUBAGENT_INTERRUPT_MESSAGE,
    booleanValue
  )
  // Official Naruto admits only depth=1. Coerce higher values so they cannot
  // contradict the launcher hard-enforcement or look "supported".
  const depthCoerced = maxDepth.value > 1
  const warnings = depthCoerced
    ? [`official_subagent_max_depth_coerced_to_one:${maxDepth.value}:${maxDepth.source}`]
    : []

  return {
    maxThreads: maxThreads.value,
    maxDepth: depthCoerced ? DEFAULT_OFFICIAL_SUBAGENT_MAX_DEPTH : maxDepth.value,
    jobMaxRuntimeSeconds: jobMaxRuntimeSeconds.value,
    interruptMessage: interruptMessage.value,
    sources: {
      maxThreads: maxThreads.source,
      maxDepth: depthCoerced ? 'default' : maxDepth.source,
      jobMaxRuntimeSeconds: jobMaxRuntimeSeconds.source,
      interruptMessage: interruptMessage.source
    },
    projectConfigPath,
    globalConfigPath,
    blockers,
    warnings
  }
}

export function officialSubagentConfigWarnings(text: string = '', inheritedText: string = ''): string[] {
  const project = configLayer(text, 'project')
  const inherited = configLayer(inheritedText, 'global')
  if (project.blockers.length || inherited.blockers.length) return []
  const maxDepth = resolveLayeredValue(
    project.agents.max_depth,
    inherited.agents.max_depth,
    DEFAULT_OFFICIAL_SUBAGENT_MAX_DEPTH,
    positiveInteger
  )
  return maxDepth.value > 1
    ? [`official_subagent_max_depth_coerced_to_one:${maxDepth.value}:${maxDepth.source}`]
    : []
}

export async function readInheritedOfficialSubagentConfigText(
  projectConfigPath: string,
  opts: { home?: string; codexHome?: string } = {}
): Promise<string> {
  const globalConfigPath = resolveInheritedOfficialSubagentConfigPath(projectConfigPath, opts)
  return globalConfigPath ? readText(globalConfigPath, '') : ''
}

export function resolveInheritedOfficialSubagentConfigPath(
  projectConfigPath: string,
  opts: { home?: string; codexHome?: string } = {}
): string | null {
  const home = opts.home || process.env.HOME || os.homedir()
  const codexHome = opts.codexHome || process.env.CODEX_HOME || path.join(home, '.codex')
  const globalConfigPath = path.resolve(codexHome, 'config.toml')
  return globalConfigPath === path.resolve(projectConfigPath) ? null : globalConfigPath
}

export async function installOfficialSubagentAgentConfigs(
  root: string,
  opts: { apply?: boolean } = {}
): Promise<OfficialSubagentAgentInstallResult> {
  const apply = opts.apply !== false
  const agentsDir = path.join(path.resolve(root), '.codex', 'agents')
  const missing: string[] = []
  const existing: string[] = []
  const stale: string[] = []
  const created: string[] = []
  const updated: string[] = []
  const preserved: string[] = []
  const invalid: string[] = []
  const backups: string[] = []
  const manualBlockers: string[] = []
  const generatedFiles: string[] = []

  const agentsInspection = await inspectConfinedPath(root, agentsDir).catch(() => null)
  if (!agentsInspection) {
    manualBlockers.push('official_subagent_agents_dir_unsafe')
  } else if (agentsInspection.leafSymlink) {
    manualBlockers.push('official_subagent_agents_dir_symlink_refused')
  } else if (agentsInspection.exists && !agentsInspection.stat?.isDirectory()) {
    manualBlockers.push('official_subagent_agents_dir_not_directory')
  }
  if (manualBlockers.length) {
    return {
      schema: 'sks.official-subagent-agent-install.v1',
      ok: false,
      apply,
      installed_agents: MANAGED_OFFICIAL_SUBAGENT_ROLES.map((role) => role.codex_name),
      missing: MANAGED_OFFICIAL_SUBAGENT_ROLES.map((role) => role.filename),
      existing,
      stale,
      created,
      updated,
      preserved,
      invalid,
      backups,
      manual_blockers: manualBlockers,
      generated_files: generatedFiles
    }
  }
  if (apply) await ensureConfinedDirectory(root, agentsDir)
  for (const role of MANAGED_OFFICIAL_SUBAGENT_ROLES) {
    const absolute = path.join(agentsDir, role.filename)
    const relative = `.codex/agents/${role.filename}`
    const expected = managedOfficialSubagentRoleContent(role)
    const inspected = await inspectConfinedPath(root, absolute).catch(() => null)
    if (!inspected) {
      preserved.push(relative)
      manualBlockers.push(`manual_unsafe_official_subagent_path:${relative}`)
      continue
    }
    if (!inspected.exists) {
      missing.push(role.filename)
      if (apply) {
        await writeTextAtomic(absolute, expected)
        created.push(relative)
        generatedFiles.push(relative)
      }
      continue
    }

    if (inspected.leafSymlink || !inspected.stat?.isFile()) {
      preserved.push(relative)
      manualBlockers.push(`manual_non_regular_official_subagent_collision:${relative}`)
      continue
    }

    const current = await readText(absolute, '')
    const validation = inspectToml(current)
    if (!validation.ok) {
      invalid.push(relative)
      preserved.push(relative)
      manualBlockers.push(`manual_invalid_official_subagent_toml:${relative}`)
      if (apply) {
        const backup = await backupInvalidToml(absolute, current, 'official-subagent-invalid')
        backups.push(path.relative(root, backup))
      }
      continue
    }

    if (current === expected) {
      existing.push(relative)
      generatedFiles.push(relative)
      continue
    }

    if (managedOfficialSubagentRoleOwnsText(current, role)) {
      stale.push(relative)
      if (apply) {
        await writeTextAtomic(absolute, expected)
        updated.push(relative)
        generatedFiles.push(relative)
      }
      continue
    }

    preserved.push(relative)
    manualBlockers.push(manualCollisionBlocker(relative, current, role))
  }

  const remainingMissing = apply
    ? missing.filter((filename) => !created.includes(`.codex/agents/${filename}`))
    : missing
  return {
    schema: 'sks.official-subagent-agent-install.v1',
    ok: manualBlockers.length === 0 && (apply ? remainingMissing.length === 0 : true),
    apply,
    installed_agents: MANAGED_OFFICIAL_SUBAGENT_ROLES.map((role) => role.codex_name),
    missing,
    existing,
    stale,
    created,
    updated,
    preserved,
    invalid,
    backups,
    manual_blockers: manualBlockers,
    generated_files: [...new Set(generatedFiles)].sort()
  }
}

export function manifestProvesSksGeneratedPath(manifest: unknown, relativePath: string): boolean {
  const files = objectValue(objectValue(manifest)?.generated_files)?.files
  return Array.isArray(files) && files.map((entry) => String(entry || '').replaceAll('\\', '/')).includes(relativePath.replaceAll('\\', '/'))
}

export function officialSubagentConfigOwnershipProof(input: {
  text?: string
  manifest?: unknown
  migrationReceipt?: unknown
} = {}): OfficialSubagentConfigOwnershipProof {
  const text = String(input.text || '')
  const reasons: string[] = []
  if (manifestProvesSksGeneratedPath(input.manifest, '.codex/config.toml')) {
    reasons.push('generated_file_inventory')
  }
  if (hasExactManagedConfigMarker(text)) reasons.push('managed_marker_or_hash')
  if (migrationReceiptProvesManagedMaxThreads(input.migrationReceipt)) {
    reasons.push('migration_receipt:agents.max_threads')
  }
  const legacyBlockCount = exactLegacyManagedAgentBlockCount(text)
  if (legacyBlockCount >= 3) reasons.push(`exact_legacy_managed_blocks:${legacyBlockCount}`)
  return { owned: reasons.length > 0, reasons: uniqueStrings(reasons) }
}

export function inspectOfficialSubagentToml(text: string = ''): { ok: boolean; error: string | null } {
  return inspectToml(text)
}

export async function backupInvalidToml(file: string, text: string, tag: string): Promise<string> {
  const safeTag = String(tag || 'invalid').replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'invalid'
  const backupPath = `${file}.sks-${safeTag}-${sha256(String(text || '')).slice(0, 16)}.bak`
  await writeTextAtomic(backupPath, String(text || ''), { mode: 0o600 })
  return backupPath
}

function manualCollisionBlocker(relative: string, text: string, role: ManagedOfficialSubagentRole): string {
  const markerPresent = String(text || '').includes(role.ownership_marker)
  return markerPresent
    ? `manual_modified_official_subagent_config:${relative}`
    : `manual_user_owned_official_subagent_collision:${relative}`
}

function configLayer(text: string, label: 'project' | 'global') {
  const validation = inspectToml(text)
  if (!validation.ok) {
    return {
      agents: {} as Record<string, unknown>,
      blockers: [`${label}_official_subagent_config_toml_parse_failed`]
    }
  }
  return {
    agents: objectValue(parsedToml(text)?.agents),
    blockers: [] as string[]
  }
}

function resolveLayeredValue<T>(
  projectValue: unknown,
  globalValue: unknown,
  fallback: T,
  validate: (value: unknown) => T | null
): { value: T; source: 'project' | 'global' | 'default' } {
  const project = validate(projectValue)
  if (project !== null) return { value: project, source: 'project' }
  const global = validate(globalValue)
  if (global !== null) return { value: global, source: 'global' }
  return { value: fallback, source: 'default' }
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function inspectToml(text: string): { ok: boolean; error: string | null } {
  try {
    parse(String(text || ''))
    return { ok: true, error: null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function parsedToml(text: string): Record<string, unknown> | null {
  try {
    return parse(String(text || '')) as Record<string, unknown>
  } catch {
    return null
  }
}

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function hasExactManagedConfigMarker(text: string): boolean {
  return /^(?:#\s*SKS-MANAGED-CODEX-CONFIG\b|#\s*SKS managed Codex config\b|#\s*sks_managed_(?:body_)?sha256\s*=\s*["'][a-f0-9]{64}["'])/mi.test(text)
}

function migrationReceiptProvesManagedMaxThreads(value: unknown): boolean {
  const root = objectValue(value)
  if (root.schema !== 'sks.project-migration-receipt.v2') return false
  if (root.status !== 'current' || root.sks_version !== PACKAGE_VERSION) return false
  if (typeof root.installation_epoch_sha256 !== 'string' || !root.installation_epoch_sha256.trim()) return false
  if (!Array.isArray(root.blockers) || root.blockers.length > 0) return false
  if (root.required_blockers !== undefined && (!Array.isArray(root.required_blockers) || root.required_blockers.length > 0)) return false
  if (root.doctor !== undefined && root.doctor !== null && objectValue(root.doctor).ok !== true) return false
  if (root.retention_cleanup !== undefined && root.retention_cleanup !== null && objectValue(root.retention_cleanup).ok === false) return false

  const stages = [
    ...(Array.isArray(root.update_stages) ? root.update_stages : []),
    ...(Array.isArray(root.migration_stages) ? root.migration_stages : [])
  ]
  if (!stages.length || stages.some((stage) => migrationStageFailed(stage))) return false
  return stages.some((stage) => migrationStageSucceeded(stage) && migrationStageProvesManagedMaxThreads(stage))
}

function migrationStageSucceeded(value: unknown): boolean {
  const stage = objectValue(value)
  if (stage.ok !== true) return false
  const status = String(stage.status || '').trim()
  return Boolean(status) && !/(?:fail|block|error|skip|pending|partial|cancel|timeout|unavailable|unknown)/i.test(status)
}

function migrationStageFailed(value: unknown): boolean {
  const stage = objectValue(value)
  const status = String(stage.status || '').trim()
  return stage.ok === false || /(?:fail|block|error|cancel|timeout)/i.test(status)
}

function migrationStageProvesManagedMaxThreads(value: unknown): boolean {
  const queue: unknown[] = [value]
  const seen = new Set<unknown>()
  while (queue.length) {
    const current = queue.shift()
    if (!current || seen.has(current)) continue
    seen.add(current)
    if (Array.isArray(current)) {
      queue.push(...current)
      continue
    }
    if (typeof current === 'string') {
      if (/\bagents\.max_threads\b/i.test(current) && /\b(?:set|write|wrote|written|upsert|update|updated|migrat(?:e|ed|ion)|manage(?:d)?|apply|applied|repair|repaired)\b/i.test(current)) return true
      continue
    }
    if (typeof current !== 'object') continue
    const row = current as Record<string, unknown>
    if (row.ok === false || /(?:fail|block|error|cancel|timeout)/i.test(String(row.status || ''))) continue
    for (const key of ['managed_keys', 'written_keys', 'migrated_keys', 'config_keys', 'keys_written']) {
      const entries = row[key]
      if (Array.isArray(entries) && entries.some((entry) => String(entry || '').trim() === 'agents.max_threads')) return true
    }
    if (String(row.key || row.config_key || '').trim() === 'agents.max_threads') return true
    for (const key of ['actions', 'detail', 'changes', 'writes', 'result', 'summary']) {
      if (row[key] !== undefined) queue.push(row[key])
    }
  }
  return false
}

function exactLegacyManagedAgentBlockCount(text: string): number {
  const agents = objectValue(parsedToml(text)?.agents)
  return LEGACY_SKS_AGENT_TABLE_SPECS.filter((spec) => exactLegacyManagedAgentRow(agents[spec.name], spec)).length
}

function removeExactLegacyManagedAgentBlocks(text: string): string {
  const agents = objectValue(parsedToml(text)?.agents)
  let next = String(text || '')
  for (const spec of LEGACY_SKS_AGENT_TABLE_SPECS) {
    if (!exactLegacyManagedAgentRow(agents[spec.name], spec)) continue
    next = removeTomlTable(next, `agents.${spec.name}`)
  }
  return next
}

function exactLegacyManagedAgentRow(
  value: unknown,
  spec: typeof LEGACY_SKS_AGENT_TABLE_SPECS[number]
): boolean {
  const row = objectValue(value)
  const keys = Object.keys(row).sort()
  const configFile = String(row.config_file || '')
  const configFilename = configFile.replaceAll('\\', '/').split('/').pop() || ''
  return JSON.stringify(keys) === JSON.stringify(['config_file', 'description', 'nickname_candidates'])
    && row.description === spec.description
    && configFilename === spec.filename
    && Array.isArray(row.nickname_candidates)
    && JSON.stringify(row.nickname_candidates) === JSON.stringify(spec.nicknames)
}

function removeTomlTable(text: string, table: string): string {
  const lines = String(text || '').split('\n')
  const header = new RegExp(`^\\s*\\[${escapeRegExp(table)}\\]\\s*(?:#.*)?$`)
  const start = lines.findIndex((line) => header.test(line))
  if (start === -1) return text
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[.+\]\s*(?:#.*)?$/.test(lines[index] || '')) {
      end = index
      break
    }
  }
  lines.splice(start, end - start)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function upsertDefaultUnlessInherited(
  text: string,
  inheritedAgents: Record<string, unknown>,
  key: string,
  line: string
): string {
  if (hasTomlTableKey(text, 'agents', key) || hasOwn(inheritedAgents, key)) return text
  return upsertTomlTableKey(text, 'agents', line)
}

function readTomlTableInteger(text: string, table: string, key: string): number | null {
  const line = tomlTableKeyLine(text, table, key)
  const match = line?.match(/^\s*[^=]+\s*=\s*([0-9]+)\s*(?:#.*)?$/)
  if (!match?.[1]) return null
  const value = Number(match[1])
  return Number.isSafeInteger(value) ? value : null
}

function hasTomlTableKey(text: string, table: string, key: string): boolean {
  return tomlTableKeyLine(text, table, key) !== null
}

function tomlTableKeyLine(text: string, table: string, key: string): string | null {
  const lines = String(text || '').split('\n')
  const start = lines.findIndex((line) => isTomlTableHeader(line, table))
  if (start === -1) return null
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`)
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] || ''
    if (/^\s*\[.+\]\s*(?:#.*)?$/.test(line)) break
    if (pattern.test(line)) return line
  }
  return null
}

function upsertTomlTableKey(text: string, table: string, line: string): string {
  const key = String(line).split('=')[0]?.trim() || ''
  let lines = String(text || '').trimEnd().split('\n')
  if (lines.length === 1 && lines[0] === '') lines = []
  const header = `[${table}]`
  const start = lines.findIndex((entry) => isTomlTableHeader(entry, table))
  if (start === -1) {
    const firstChild = lines.findIndex((entry) => entry.trim().startsWith(`[${table}.`))
    const block = [header, line, '']
    if (firstChild >= 0) {
      lines.splice(firstChild, 0, ...block)
      return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
    }
    return [...lines, ...(lines.length ? [''] : []), header, line].join('\n').replace(/\n{3,}/g, '\n\n')
  }
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[.+\]\s*(?:#.*)?$/.test(lines[index] || '')) {
      end = index
      break
    }
  }
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`)
  for (let index = start + 1; index < end; index += 1) {
    if (pattern.test(lines[index] || '')) {
      lines[index] = line
      return lines.join('\n').replace(/\n{3,}/g, '\n\n')
    }
  }
  lines.splice(end, 0, line)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}

function ensureTrailingNewline(text: string): string {
  const value = String(text || '').trimEnd()
  return value ? `${value}\n` : ''
}

function isTomlTableHeader(line: string, table: string): boolean {
  return new RegExp(`^\\s*\\[${escapeRegExp(table)}\\]\\s*(?:#.*)?$`).test(String(line || ''))
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function escapeRegExp(value: string): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const LEGACY_SKS_AGENT_TABLE_SPECS = [
  { name: 'analysis_scout', filename: 'analysis-scout.toml', description: 'SKS scout with bounded write capability.', nicknames: ['Scout', 'Mapper'] },
  { name: 'native_agent', filename: 'native-agent-intake.toml', description: 'SKS native agent with bounded write capability.', nicknames: ['Analysis', 'Mapper'] },
  { name: 'team_consensus', filename: 'team-consensus.toml', description: 'SKS planning/debate agent with bounded write capability.', nicknames: ['Consensus', 'Atlas'] },
  { name: 'implementation_worker', filename: 'implementation-worker.toml', description: 'SKS bounded implementation worker.', nicknames: ['Builder', 'Mason'] },
  { name: 'db_safety_reviewer', filename: 'db-safety-reviewer.toml', description: 'DB safety reviewer with bounded write capability.', nicknames: ['Sentinel', 'Ledger'] },
  { name: 'qa_reviewer', filename: 'qa-reviewer.toml', description: 'QA reviewer with bounded write capability.', nicknames: ['Verifier', 'Reviewer'] }
] as const
