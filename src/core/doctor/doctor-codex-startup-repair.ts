import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { REQUIRED_CODEX_MODEL, DEFAULT_CODEX_REASONING_EFFORT } from '../codex-model-guard.js'
import { ensureDir, exists, nowIso, readText, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import { isUnmanagedProjectCodexConfig, writeCodexConfigGuarded } from '../codex/codex-config-guard.js'

export const DOCTOR_CODEX_STARTUP_REPAIR_SCHEMA = 'sks.doctor-codex-startup-repair.v1'

type Scope = 'project' | 'global'

const AGENT_ROLE_FILES = new Map<string, { file: string; description: string; sandbox: 'read-only' | 'workspace-write'; nicknames: string[] }>([
  ['analysis_scout', { file: 'analysis-scout.toml', description: 'SKS scout with bounded write capability.', sandbox: 'workspace-write', nicknames: ['Scout', 'Mapper'] }],
  ['native_agent', { file: 'native-agent-intake.toml', description: 'SKS native agent with bounded write capability.', sandbox: 'workspace-write', nicknames: ['Analysis', 'Mapper'] }],
  ['team_consensus', { file: 'team-consensus.toml', description: 'SKS planning/debate agent with bounded write capability.', sandbox: 'workspace-write', nicknames: ['Consensus', 'Atlas'] }],
  ['implementation_worker', { file: 'implementation-worker.toml', description: 'SKS bounded implementation worker.', sandbox: 'workspace-write', nicknames: ['Builder', 'Mason'] }],
  ['db_safety_reviewer', { file: 'db-safety-reviewer.toml', description: 'DB safety reviewer with bounded write capability.', sandbox: 'workspace-write', nicknames: ['Sentinel', 'Ledger'] }],
  ['qa_reviewer', { file: 'qa-reviewer.toml', description: 'QA reviewer with bounded write capability.', sandbox: 'workspace-write', nicknames: ['Verifier', 'Reviewer'] }]
])

const DIRECTIVE_ROLE_FILES = [
  'sks-explorer.toml',
  'sks-planner.toml',
  'sks-implementer.toml',
  'sks-checker.toml',
  'sks-release-verifier.toml',
  'sks-zellij-ui-verifier.toml',
  'sks-codex-probe-verifier.toml'
]

export interface DoctorCodexStartupRepairResult {
  schema: typeof DOCTOR_CODEX_STARTUP_REPAIR_SCHEMA
  ok: boolean
  generated_at: string
  fix: boolean
  configs: Array<{
    scope: Scope
    path: string
    present: boolean
    changed: boolean
    backup_path: string | null
    agent_config_files_repaired: string[]
    stale_mcp_blocks_removed: string[]
    mcp_blocks_repaired: string[]
    optional_mcp_blocks_ignored: string[]
    blockers: string[]
    warnings: string[]
    duplicate_toml_blocks_removed: string[]
  }>
  agent_role_files: {
    sanitized: string[]
    created: string[]
    blockers: string[]
  }
  actions: string[]
  manual_actions: string[]
  blockers: string[]
  warnings: string[]
  report_path: string
}

export async function runDoctorCodexStartupRepair(input: {
  root: string
  fix: boolean
  codexHome?: string
  nodeReplCommandCandidates?: string[]
  includeDefaultNodeReplCandidates?: boolean
}): Promise<DoctorCodexStartupRepairResult> {
  const root = path.resolve(input.root || process.cwd())
  const codexHome = input.codexHome || process.env.CODEX_HOME || path.join(process.env.HOME || os.homedir(), '.codex')
  const roleFiles = input.fix
    ? await repairAgentRoleFiles(root, codexHome)
    : await inspectAgentRoleFiles(root, codexHome)
  const configs = []
  for (const candidate of [
    { scope: 'project' as const, path: path.join(root, '.codex', 'config.toml'), agentDir: path.join(root, '.codex', 'agents') },
    { scope: 'global' as const, path: path.join(codexHome, 'config.toml'), agentDir: path.join(codexHome, 'agents') }
  ]) {
    configs.push(await inspectOrRepairConfig(root, candidate, input.fix, input.nodeReplCommandCandidates || [], input.includeDefaultNodeReplCandidates !== false))
  }
  const blockers = [...roleFiles.blockers, ...configs.flatMap((entry) => entry.blockers.map((item) => `${entry.scope}:${item}`))]
  const warnings = configs.flatMap((entry) => entry.warnings.map((item) => `${entry.scope}:${item}`))
  const actions = [
    ...roleFiles.sanitized.map((file) => `removed unsupported message_role_prefix from ${file}`),
    ...roleFiles.created.map((file) => `created missing SKS agent role config ${file}`),
    ...configs.flatMap((entry) => [
      ...entry.agent_config_files_repaired.map((file) => `${entry.scope} agent config_file now points at ${file}`),
      ...(entry.mcp_blocks_repaired || []).map((server) => `${entry.scope} MCP block repaired: ${server}`),
      ...entry.stale_mcp_blocks_removed.map((server) => `${entry.scope} stale MCP block removed: ${server}`),
      ...entry.duplicate_toml_blocks_removed.map((header) => `${entry.scope} duplicate TOML table removed: ${header}`)
    ])
  ]
  const manualActions = [
    ...configs.flatMap((entry) => entry.blockers
      .filter((item) => item.includes('codex_apps_token_expired'))
      .map(() => 'Codex Apps MCP token is expired; sign in to Codex App/CLI again so the connector can mint a fresh token.')),
    ...configs.flatMap((entry) => entry.blockers
      .filter((item) => item.includes('supabase_access_token_missing'))
      .map(() => 'Supabase MCP uses SUPABASE_ACCESS_TOKEN but the variable is unset; export the token or migrate that server to a read-only remote URL.'))
  ]
  const reportPath = path.join(root, '.sneakoscope', 'reports', 'doctor-codex-startup-repair.json')
  const report: DoctorCodexStartupRepairResult = {
    schema: DOCTOR_CODEX_STARTUP_REPAIR_SCHEMA,
    ok: blockers.length === 0,
    generated_at: nowIso(),
    fix: input.fix === true,
    configs,
    agent_role_files: roleFiles,
    actions,
    manual_actions: [...new Set(manualActions)],
    blockers,
    warnings,
    report_path: reportPath
  }
  await writeJsonAtomic(reportPath, report)
  return report
}

async function inspectOrRepairConfig(root: string, candidate: { scope: Scope; path: string; agentDir: string }, fix: boolean, nodeReplCommandCandidates: string[], includeDefaultNodeReplCandidates: boolean): Promise<DoctorCodexStartupRepairResult['configs'][number]> {
  const text = await readText(candidate.path, null)
  if (text == null) {
    return {
      scope: candidate.scope,
      path: candidate.path,
      present: false,
      changed: false,
      backup_path: null,
      agent_config_files_repaired: [],
      stale_mcp_blocks_removed: [],
      mcp_blocks_repaired: [],
      optional_mcp_blocks_ignored: [],
      blockers: [],
      warnings: candidate.scope === 'global' ? ['codex_home_config_missing_optional'] : [],
      duplicate_toml_blocks_removed: []
    }
  }
  if (fix && isUnmanagedProjectCodexConfig(root, candidate.path, text)) {
    return {
      scope: candidate.scope,
      path: candidate.path,
      present: true,
      changed: false,
      backup_path: null,
      agent_config_files_repaired: [],
      stale_mcp_blocks_removed: [],
      mcp_blocks_repaired: [],
      optional_mcp_blocks_ignored: [],
      blockers: ['user_owned_file_without_sks_marker'],
      warnings: ['unmanaged_project_config_preserved'],
      duplicate_toml_blocks_removed: []
    }
  }
  let next = text
  const agentConfigFilesRepaired: string[] = []
  const staleMcpBlocksRemoved: string[] = []
  const mcpBlocksRepaired: string[] = []
  const optionalMcpBlocksIgnored: string[] = []
  const duplicateTomlBlocksRemoved: string[] = []
  const blockers: string[] = []
  const warnings: string[] = []

  const duplicateRepair = inspectOrRepairDuplicateTomlBlocks(next, candidate, fix)
  next = duplicateRepair.text
  duplicateTomlBlocksRemoved.push(...duplicateRepair.removed)
  warnings.push(...duplicateRepair.warnings)

  for (const [tableName, role] of AGENT_ROLE_FILES) {
    const target = path.join(candidate.agentDir, role.file)
    let table = tomlBlock(next, `agents.${tableName}`)
    if (!table) continue
    const currentDescription = stringValue(table.text, 'description')
    if (currentDescription !== role.description) {
      if (!fix) warnings.push(`agent_description_stale:${tableName}`)
      else {
        next = replaceOrInsertKey(next, table, 'description', `"${escapeToml(role.description)}"`)
        table = tomlBlock(next, `agents.${tableName}`)
        if (!table) continue
      }
    }
    const current = stringValue(table.text, 'config_file')
    const targetExists = await exists(target)
    const currentValid = Boolean(current && path.isAbsolute(current) && await exists(current))
    if (currentValid && current === target) continue
    if (!fix) {
      warnings.push(`agent_config_file_stale:${tableName}`)
      continue
    }
    if (!targetExists) {
      await ensureDir(path.dirname(target))
      await writeTextAtomic(target, roleConfigToml(tableName, role.description, role.sandbox))
    }
    next = replaceOrInsertKey(next, table, 'config_file', `"${escapeToml(target)}"`)
    agentConfigFilesRepaired.push(target)
  }

  const nodeReplRepair = await inspectOrRepairNodeRepl(next, fix, nodeReplCommandCandidates, includeDefaultNodeReplCandidates)
  next = nodeReplRepair.text
  warnings.push(...nodeReplRepair.warnings)
  staleMcpBlocksRemoved.push(...nodeReplRepair.removed)
  mcpBlocksRepaired.push(...nodeReplRepair.repaired)

  for (const server of ['supabase_sauron']) {
    if (tomlBlock(next, `mcp_servers.${server}`)) optionalMcpBlocksIgnored.push(server)
  }

  const supabase = tomlBlock(next, 'mcp_servers.supabase')
  if (supabase && /\bSUPABASE_ACCESS_TOKEN\b/.test(supabase.text) && !process.env.SUPABASE_ACCESS_TOKEN) {
    blockers.push('supabase_access_token_missing')
  }
  const codexApps = tomlBlock(next, 'mcp_servers.codex_apps')
  if (codexApps && /token_expired|expired/i.test(codexApps.text)) blockers.push('codex_apps_token_expired')

  const changed = next !== text
  const backupPath = changed && fix ? await backupConfig(candidate.path, text, 'startup') : null
  if (changed && fix) await writeCodexConfigGuarded({
    root,
    configPath: candidate.path,
    before: text,
    cause: 'doctor-codex-startup-repair',
    mutate: () => next.replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n')
  })
  return {
    scope: candidate.scope,
    path: candidate.path,
    present: true,
    changed,
    backup_path: backupPath,
    agent_config_files_repaired: agentConfigFilesRepaired,
    stale_mcp_blocks_removed: staleMcpBlocksRemoved,
    mcp_blocks_repaired: mcpBlocksRepaired,
    optional_mcp_blocks_ignored: optionalMcpBlocksIgnored,
    blockers,
    warnings,
    duplicate_toml_blocks_removed: duplicateTomlBlocksRemoved
  }
}

function inspectOrRepairDuplicateTomlBlocks(text: string, candidate: { scope: Scope; path: string; agentDir: string }, fix: boolean) {
  const blocks = tomlBlocks(text)
  const groups = new Map<string, Array<TomlNamedBlock>>()
  for (const block of blocks) {
    const list = groups.get(block.header) || []
    list.push(block)
    groups.set(block.header, list)
  }
  const warnings: string[] = []
  const removals: TomlNamedBlock[] = []
  for (const [header, rows] of groups) {
    if (rows.length < 2) continue
    warnings.push(`duplicate_toml_table:${header}`)
    const keep = selectDuplicateTomlBlockToKeep(header, rows, candidate)
    for (let index = 0; index < rows.length; index += 1) {
      if (index !== keep) removals.push(rows[index] as TomlNamedBlock)
    }
  }
  if (!removals.length || !fix) return { text, warnings, removed: [] as string[] }
  return {
    text: removeBlocks(text, removals),
    warnings,
    removed: removals.map((block) => block.header)
  }
}

interface TomlNamedBlock {
  header: string
  start: number
  end: number
  text: string
}

function tomlBlocks(text: string): TomlNamedBlock[] {
  const source = String(text || '')
  const matches = [...source.matchAll(/(^|\n)\s*\[([^\]]+)\]\s*(?:#.*)?(?:\n|$)/g)]
  return matches.map((match, index) => {
    const start = Number(match.index || 0) + (match[1] ? 1 : 0)
    const next = matches[index + 1]
    const end = next ? Number(next.index || 0) + (next[1] ? 1 : 0) : source.length
    return {
      header: String(match[2] || '').trim(),
      start,
      end,
      text: source.slice(start, end)
    }
  })
}

function selectDuplicateTomlBlockToKeep(header: string, rows: TomlNamedBlock[], candidate: { agentDir: string }): number {
  const agentName = header.startsWith('agents.') ? header.slice('agents.'.length) : ''
  const role = agentName ? AGENT_ROLE_FILES.get(agentName) : undefined
  if (role) {
    const target = path.join(candidate.agentDir, role.file)
    return maxIndexBy(rows, (block, index) => {
      const configFile = stringValue(block.text, 'config_file')
      const description = stringValue(block.text, 'description')
      return (
        (configFile === target ? 100 : 0) +
        (configFile && path.isAbsolute(configFile) ? 20 : 0) +
        (description === role.description ? 30 : 0) +
        assignmentCount(block.text) -
        index / 1000
      )
    })
  }
  if (header.startsWith('mcp_servers.')) return 0
  return maxIndexBy(rows, (block, index) => assignmentCount(block.text) - index / 1000)
}

function maxIndexBy<T>(rows: T[], score: (row: T, index: number) => number): number {
  let best = 0
  let bestScore = Number.NEGATIVE_INFINITY
  rows.forEach((row, index) => {
    const value = score(row, index)
    if (value > bestScore) {
      best = index
      bestScore = value
    }
  })
  return best
}

function assignmentCount(text: string): number {
  return String(text || '').split(/\r?\n/).filter((line) => /^\s*[A-Za-z0-9_.-]+\s*=/.test(line)).length
}

async function inspectOrRepairNodeRepl(text: string, fix: boolean, extraCandidates: string[], includeDefaultCandidates: boolean) {
  const server = 'node_repl'
  const table = tomlBlock(text, `mcp_servers.${server}`)
  const fullTable = tomlBlockWithChildren(text, `mcp_servers.${server}`)
  const childBlocks = tomlChildBlocks(text, `mcp_servers.${server}`)
  if (!table && childBlocks.length === 0) return { text, warnings: [] as string[], removed: [] as string[], repaired: [] as string[] }

  const command = table ? stringValue(table.text, 'command') : null
  if (command && await commandExists(command)) {
    return { text, warnings: [] as string[], removed: [] as string[], repaired: [] as string[] }
  }

  const warnings = [table ? `stale_mcp_command_missing:${server}` : `stale_mcp_orphan_children:${server}`]
  if (!fix) return { text, warnings, removed: [] as string[], repaired: [] as string[] }

  const replacement = await firstExistingNodeReplCommand(text, extraCandidates, includeDefaultCandidates)
  if (replacement) {
    if (table) {
      return {
        text: replaceOrInsertKey(text, table, 'command', `"${escapeToml(replacement)}"`),
        warnings,
        removed: [] as string[],
        repaired: [server]
      }
    }
    if (childBlocks.length) {
      const firstChild = childBlocks[0]
      if (!firstChild) return { text, warnings, removed: [] as string[], repaired: [] as string[] }
      const mainBlock = `[mcp_servers.${server}]\ncommand = "${escapeToml(replacement)}"\nargs = []\n\n`
      return {
        text: `${text.slice(0, firstChild.start).trimEnd()}${firstChild.start > 0 ? '\n\n' : ''}${mainBlock}${text.slice(firstChild.start).replace(/^\n+/, '')}`,
        warnings,
        removed: [] as string[],
        repaired: [server]
      }
    }
  }

  const removalBlocks = [
    ...(fullTable ? [fullTable] : table ? [table] : []),
    ...childBlocks.filter((block) => !fullTable || block.start < fullTable.start || block.end > fullTable.end)
  ]
  return {
    text: removeBlocks(text, removalBlocks),
    warnings,
    removed: [server],
    repaired: [] as string[]
  }
}

async function inspectAgentRoleFiles(root: string, codexHome: string): Promise<DoctorCodexStartupRepairResult['agent_role_files']> {
  const dirs = [path.join(root, '.codex', 'agents'), path.join(codexHome, 'agents')]
  const sanitized: string[] = []
  for (const dir of dirs) {
    for (const file of DIRECTIVE_ROLE_FILES) {
      const full = path.join(dir, file)
      const text = await readText(full, null)
      if (typeof text === 'string' && /\bmessage_role_prefix\s*=/.test(text) && /SKS managed 3\.1\./.test(text)) sanitized.push(full)
    }
  }
  return { sanitized, created: [], blockers: [] }
}

async function repairAgentRoleFiles(root: string, codexHome: string): Promise<DoctorCodexStartupRepairResult['agent_role_files']> {
  const dirs = [path.join(root, '.codex', 'agents'), path.join(codexHome, 'agents')]
  const sanitized: string[] = []
  const created: string[] = []
  const blockers: string[] = []
  for (const dir of dirs) {
    for (const [name, role] of AGENT_ROLE_FILES) {
      const file = path.join(dir, role.file)
      const text = await readText(file, null)
      if (text == null) {
        await ensureDir(dir)
        await writeTextAtomic(file, roleConfigToml(name, role.description, role.sandbox))
        created.push(file)
        continue
      }
      if (!text.includes(`sandbox_mode = "${role.sandbox}"`) || text.includes('Do not edit files.')) {
        await backupConfig(file, text, 'role-write-capable')
        await writeTextAtomic(file, roleConfigToml(name, role.description, role.sandbox))
        sanitized.push(file)
      }
    }
    for (const file of DIRECTIVE_ROLE_FILES) {
      const full = path.join(dir, file)
      const text = await readText(full, null)
      if (typeof text !== 'string') continue
      if (!/\bmessage_role_prefix\s*=/.test(text) || !/SKS managed 3\.1\./.test(text)) continue
      const next = text.split('\n').filter((line) => !/^\s*message_role_prefix\s*=/.test(line)).join('\n')
      await backupConfig(full, text, 'role')
      await writeTextAtomic(full, next.replace(/\s*$/, '\n'))
      sanitized.push(full)
    }
  }
  return { sanitized, created, blockers }
}

function tomlBlock(text: string, table: string): { start: number; end: number; text: string } | null {
  const header = new RegExp(`(^|\\n)\\s*\\[${escapeRegExp(table)}\\]\\s*(?:#.*)?(?:\\n|$)`, 'g')
  const match = header.exec(text)
  if (!match) return null
  const start = match.index + (match[1] ? 1 : 0)
  const rest = text.slice(header.lastIndex)
  const nextHeader = rest.search(/\n\s*\[[^\]]+\]\s*(?:#.*)?(?:\n|$)/)
  const end = nextHeader >= 0 ? header.lastIndex + nextHeader : text.length
  return { start, end, text: text.slice(start, end) }
}

function tomlBlockWithChildren(text: string, table: string): { start: number; end: number; text: string } | null {
  const header = new RegExp(`(^|\\n)\\s*\\[${escapeRegExp(table)}\\]\\s*(?:#.*)?(?:\\n|$)`, 'g')
  const match = header.exec(text)
  if (!match) return null
  const start = match.index + (match[1] ? 1 : 0)
  const rest = text.slice(header.lastIndex)
  const nextHeader = rest.search(new RegExp(`\\n\\s*\\[(?!${escapeRegExp(table)}(?:\\.|\\]))[^\\]]+\\]\\s*(?:#.*)?(?:\\n|$)`))
  const end = nextHeader >= 0 ? header.lastIndex + nextHeader : text.length
  return { start, end, text: text.slice(start, end) }
}

function tomlChildBlocks(text: string, table: string): Array<{ start: number; end: number; text: string }> {
  const blocks: Array<{ start: number; end: number; text: string }> = []
  const header = new RegExp(`(^|\\n)\\s*\\[${escapeRegExp(table)}\\.[^\\]]+\\]\\s*(?:#.*)?(?:\\n|$)`, 'g')
  let match: RegExpExecArray | null
  while ((match = header.exec(text))) {
    const start = match.index + (match[1] ? 1 : 0)
    const rest = text.slice(header.lastIndex)
    const nextHeader = rest.search(new RegExp(`\\n\\s*\\[(?!${escapeRegExp(table)}\\.)[^\\]]+\\]\\s*(?:#.*)?(?:\\n|$)`))
    const end = nextHeader >= 0 ? header.lastIndex + nextHeader : text.length
    blocks.push({ start, end, text: text.slice(start, end) })
  }
  return blocks
}

function removeTomlBlock(text: string, block: { start: number; end: number }): string {
  return `${text.slice(0, block.start).trimEnd()}${block.start > 0 ? '\n\n' : ''}${text.slice(block.end).replace(/^\n+/, '')}`
}

function removeBlocks(text: string, blocks: Array<{ start: number; end: number }>): string {
  return [...blocks]
    .sort((a, b) => b.start - a.start)
    .reduce((current, block) => removeTomlBlock(current, block), text)
}

function replaceOrInsertKey(text: string, block: { start: number; end: number; text: string }, key: string, encodedValue: string): string {
  const lines = block.text.replace(/\s*$/, '').split('\n')
  const re = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`)
  const index = lines.findIndex((line) => re.test(line))
  if (index >= 0) lines[index] = `${key} = ${encodedValue}`
  else lines.push(`${key} = ${encodedValue}`)
  const replacement = `${lines.join('\n')}\n`
  return `${text.slice(0, block.start)}${replacement}${text.slice(block.end)}`
}

function stringValue(text: string, key: string): string | null {
  const match = text.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"([^"]*)"`, 'm'))
  return match && typeof match[1] === 'string' ? match[1] : null
}

async function commandExists(command: string): Promise<boolean> {
  if (command.includes(path.sep)) return exists(command)
  const paths = String(process.env.PATH || '').split(path.delimiter).filter(Boolean)
  for (const dir of paths) if (await exists(path.join(dir, command))) return true
  return false
}

async function firstExistingNodeReplCommand(configText: string, extraCandidates: string[], includeDefaultCandidates: boolean): Promise<string | null> {
  const candidates = [
    ...extraCandidates,
    ...(includeDefaultCandidates ? [
      process.env.SKS_NODE_REPL_COMMAND,
      process.env.NODE_REPL_COMMAND,
      ...nodeReplCandidatesFromNodePaths([
        ...stringValues(configText, 'NODE_REPL_NODE_PATH'),
        process.env.NODE_REPL_NODE_PATH
      ]),
      '/Applications/Codex.app/Contents/Resources/cua_node/bin/node_repl',
      '/Applications/Codex.app/Contents/Resources/node_repl'
    ] : [])
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  for (const candidate of [...new Set(candidates)]) {
    if (await commandExists(candidate)) return candidate
  }
  return null
}

function nodeReplCandidatesFromNodePaths(values: Array<string | undefined>): string[] {
  const out: string[] = []
  for (const value of values) {
    const nodePath = String(value || '').trim()
    if (!nodePath) continue
    const dir = path.dirname(nodePath)
    out.push(path.join(dir, 'node_repl'))
    const resources = path.basename(dir) === 'bin' ? path.dirname(path.dirname(dir)) : dir
    out.push(path.join(resources, 'cua_node', 'bin', 'node_repl'))
  }
  return out
}

function stringValues(text: string, key: string): string[] {
  const re = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"([^"]*)"`, 'gm')
  return [...text.matchAll(re)].map((match) => String(match[1] || '')).filter(Boolean)
}

async function backupConfig(configPath: string, text: string, label: string): Promise<string | null> {
  try {
    const backupPath = `${configPath}.sks-${label}-${Date.now().toString(36)}.bak`
    await ensureDir(path.dirname(backupPath))
    await writeTextAtomic(backupPath, text)
    return backupPath
  } catch {
    return null
  }
}

function roleConfigToml(name: string, description: string, sandbox: 'read-only' | 'workspace-write'): string {
  return [
    `name = "${name}"`,
    `description = "${description}"`,
    `model = "${REQUIRED_CODEX_MODEL}"`,
    `model_reasoning_effort = "${DEFAULT_CODEX_REASONING_EFFORT}"`,
    `sandbox_mode = "${sandbox}"`,
    'approval_policy = "never"',
    'developer_instructions = """',
    `You are the SKS ${name} role.`,
    sandbox === 'read-only' ? 'Do not edit files.' : 'Only edit the bounded files assigned by the parent orchestrator.',
    'Return concise source-backed findings and LIVE_EVENT lines when applicable.',
    '"""',
    ''
  ].join('\n')
}

function escapeToml(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
