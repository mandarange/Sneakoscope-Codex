import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { REQUIRED_CODEX_MODEL } from '../codex-model-guard.js'
import { ensureDir, exists, nowIso, readText, writeJsonAtomic, writeTextAtomic } from '../fsx.js'

export const DOCTOR_CODEX_STARTUP_REPAIR_SCHEMA = 'sks.doctor-codex-startup-repair.v1'

type Scope = 'project' | 'global'

const AGENT_ROLE_FILES = new Map<string, { file: string; description: string; sandbox: 'read-only' | 'workspace-write'; nicknames: string[] }>([
  ['analysis_scout', { file: 'analysis-scout.toml', description: 'Read-only SKS scout.', sandbox: 'read-only', nicknames: ['Scout', 'Mapper'] }],
  ['native_agent', { file: 'native-agent-intake.toml', description: 'Read-only SKS analysis agent.', sandbox: 'read-only', nicknames: ['Analysis', 'Mapper'] }],
  ['team_consensus', { file: 'team-consensus.toml', description: 'SKS planning/debate agent.', sandbox: 'read-only', nicknames: ['Consensus', 'Atlas'] }],
  ['implementation_worker', { file: 'implementation-worker.toml', description: 'SKS bounded implementation worker.', sandbox: 'workspace-write', nicknames: ['Builder', 'Mason'] }],
  ['db_safety_reviewer', { file: 'db-safety-reviewer.toml', description: 'Read-only DB safety reviewer.', sandbox: 'read-only', nicknames: ['Sentinel', 'Ledger'] }],
  ['qa_reviewer', { file: 'qa-reviewer.toml', description: 'Read-only QA reviewer.', sandbox: 'read-only', nicknames: ['Verifier', 'Reviewer'] }]
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
    optional_mcp_blocks_ignored: string[]
    blockers: string[]
    warnings: string[]
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
    configs.push(await inspectOrRepairConfig(candidate, input.fix))
  }
  const blockers = [...roleFiles.blockers, ...configs.flatMap((entry) => entry.blockers.map((item) => `${entry.scope}:${item}`))]
  const warnings = configs.flatMap((entry) => entry.warnings.map((item) => `${entry.scope}:${item}`))
  const actions = [
    ...roleFiles.sanitized.map((file) => `removed unsupported message_role_prefix from ${file}`),
    ...roleFiles.created.map((file) => `created missing SKS agent role config ${file}`),
    ...configs.flatMap((entry) => [
      ...entry.agent_config_files_repaired.map((file) => `${entry.scope} agent config_file now points at ${file}`),
      ...entry.stale_mcp_blocks_removed.map((server) => `${entry.scope} stale MCP block removed: ${server}`)
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

async function inspectOrRepairConfig(candidate: { scope: Scope; path: string; agentDir: string }, fix: boolean): Promise<DoctorCodexStartupRepairResult['configs'][number]> {
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
      optional_mcp_blocks_ignored: [],
      blockers: [],
      warnings: candidate.scope === 'global' ? ['codex_home_config_missing_optional'] : []
    }
  }
  let next = text
  const agentConfigFilesRepaired: string[] = []
  const staleMcpBlocksRemoved: string[] = []
  const optionalMcpBlocksIgnored: string[] = []
  const blockers: string[] = []
  const warnings: string[] = []

  for (const [tableName, role] of AGENT_ROLE_FILES) {
    const target = path.join(candidate.agentDir, role.file)
    const table = tomlBlock(next, `agents.${tableName}`)
    if (!table) continue
    const current = stringValue(table.text, 'config_file')
    const targetExists = await exists(target)
    const currentValid = Boolean(current && path.isAbsolute(current) && await exists(current))
    if (currentValid && current === target) continue
    warnings.push(`agent_config_file_stale:${tableName}`)
    if (!fix) continue
    if (!targetExists) {
      await ensureDir(path.dirname(target))
      await writeTextAtomic(target, roleConfigToml(tableName, role.description, role.sandbox))
    }
    next = replaceOrInsertKey(next, table, 'config_file', `"${escapeToml(target)}"`)
    agentConfigFilesRepaired.push(target)
  }

  for (const server of ['node_repl']) {
    const table = tomlBlock(next, `mcp_servers.${server}`)
    if (!table) continue
    const command = stringValue(table.text, 'command')
    if (!command || await commandExists(command)) continue
    warnings.push(`stale_mcp_command_missing:${server}`)
    if (fix) {
      next = removeTomlBlock(next, table)
      staleMcpBlocksRemoved.push(server)
    }
  }

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
  if (changed && fix) await writeTextAtomic(candidate.path, next.replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n'))
  return {
    scope: candidate.scope,
    path: candidate.path,
    present: true,
    changed,
    backup_path: backupPath,
    agent_config_files_repaired: agentConfigFilesRepaired,
    stale_mcp_blocks_removed: staleMcpBlocksRemoved,
    optional_mcp_blocks_ignored: optionalMcpBlocksIgnored,
    blockers,
    warnings
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

function removeTomlBlock(text: string, block: { start: number; end: number }): string {
  return `${text.slice(0, block.start).trimEnd()}${block.start > 0 ? '\n\n' : ''}${text.slice(block.end).replace(/^\n+/, '')}`
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
    'model_reasoning_effort = "medium"',
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
