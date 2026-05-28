import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ensureDir, nowIso, readText, writeJsonAtomic, writeTextAtomic } from '../fsx.js'

export const CODEX_PROJECT_CONFIG_POLICY_SCHEMA = 'sks.codex-project-config-policy.v1'

const MACHINE_LOCAL_TOP_LEVEL_KEYS = new Set([
  'profile',
  'profiles',
  'model_provider',
  'model_providers',
  'openai_base_url',
  'chatgpt_base_url',
  'notify',
  'otel',
  'telemetry'
])

const MACHINE_LOCAL_TABLE_PREFIXES = [
  'profiles',
  'model_providers',
  'notify',
  'otel',
  'telemetry',
  'experimental_telemetry'
]

export async function splitCodexProjectConfigPolicy(rootInput: string = process.cwd(), opts: any = {}) {
  const root = path.resolve(rootInput || process.cwd())
  const configPath = path.resolve(opts.configPath || path.join(root, '.codex', 'config.toml'))
  const codexHome = path.resolve(opts.codexHome || process.env.CODEX_HOME || path.join(process.env.HOME || os.homedir(), '.codex'))
  const reportPath = opts.reportPath || path.join(root, '.sneakoscope', 'reports', 'codex-project-config-policy.json')
  const original = await readText(configPath, null)
  if (original === null) {
    const report = {
      schema: CODEX_PROJECT_CONFIG_POLICY_SCHEMA,
      generated_at: nowIso(),
      root,
      config_path: configPath,
      codex_home: codexHome,
      ok: true,
      status: 'project_config_missing',
      changed: false,
      moved_keys: [],
      moved_tables: [],
      actions: [],
      blockers: []
    }
    if (opts.writeReport !== false) await writeJsonAtomic(reportPath, { ...report, report_path: reportPath })
    return report
  }

  const split = splitProjectToml(String(original))
  const profileName = split.profile_name || opts.profileName || null
  const projectText = normalizeProjectText(split.project_text)
  const changed = projectText !== String(original)
  const actions: string[] = []
  let backupPath: string | null = null
  let userConfigPath: string | null = null
  let profileConfigPath: string | null = null

  if (opts.apply && changed) {
    backupPath = `${configPath}.bak-${Date.now().toString(36)}`
    await ensureDir(path.dirname(configPath))
    await fsp.copyFile(configPath, backupPath)
    await writeTextAtomic(configPath, projectText)
    actions.push('project_config_rewritten_with_backup')
  }

  if (opts.apply && split.machine_text.trim()) {
    await ensureDir(codexHome)
    userConfigPath = path.join(codexHome, 'config.toml')
    const currentUser = await readText(userConfigPath, '')
    const movedBlock = [
      '',
      `# SKS moved machine-local Codex config from ${path.relative(root, configPath) || configPath} at ${nowIso()}`,
      split.machine_text.trim(),
      ''
    ].join('\n')
    await writeTextAtomic(userConfigPath, `${String(currentUser || '').replace(/\s+$/, '')}${movedBlock}`.replace(/^\n+/, ''))
    actions.push('machine_local_keys_moved_to_codex_home_config')
  }

  const profileBody = profileName ? profileTableBody(split.machine_blocks, profileName) : ''
  if (opts.apply && profileName && profileBody.trim()) {
    profileConfigPath = path.join(codexHome, `${profileName}.config.toml`)
    const existing = await readText(profileConfigPath, '')
    await writeTextAtomic(profileConfigPath, `${String(existing || '').replace(/\s+$/, '')}\n${profileBody.trim()}\n`.replace(/^\n+/, ''))
    actions.push('selected_profile_table_moved_to_profile_config')
  }

  const report = {
    schema: CODEX_PROJECT_CONFIG_POLICY_SCHEMA,
    generated_at: nowIso(),
    root,
    config_path: configPath,
    codex_home: codexHome,
    ok: true,
    changed,
    applied: opts.apply === true,
    backup_path: backupPath,
    user_config_path: userConfigPath,
    profile_config_path: profileConfigPath,
    profile_name: profileName,
    moved_keys: split.moved_keys,
    moved_tables: split.moved_tables,
    deprecated_approval_policy_fixed: split.deprecated_approval_policy_fixed,
    actions,
    blockers: []
  }
  if (opts.writeReport !== false) await writeJsonAtomic(reportPath, { ...report, report_path: reportPath })
  return report
}

function splitProjectToml(text: string) {
  const blocks = tomlBlocks(text)
  const kept: string[] = []
  const moved: string[] = []
  const machineBlocks: any[] = []
  const movedKeys: string[] = []
  const movedTables: string[] = []
  let profileName: string | null = null
  let deprecatedFixed = false

  for (const block of blocks) {
    if (block.table && isMachineLocalTable(block.table)) {
      moved.push(block.text)
      machineBlocks.push(block)
      movedTables.push(block.table)
      continue
    }
    if (!block.table) {
      const keepLines: string[] = []
      const moveLines: string[] = []
      for (const line of block.text.split('\n')) {
        const key = topLevelKey(line)
        if (key && MACHINE_LOCAL_TOP_LEVEL_KEYS.has(key)) {
          moveLines.push(line)
          movedKeys.push(key)
          if (key === 'profile') profileName = tomlStringValue(line)
          continue
        }
        const fixed = fixDeprecatedApprovalPolicy(line)
        if (fixed !== line) deprecatedFixed = true
        keepLines.push(fixed)
      }
      if (keepLines.some((line) => line.trim())) kept.push(keepLines.join('\n'))
      if (moveLines.length) moved.push(moveLines.join('\n'))
      continue
    }
    const fixedText = block.text.split('\n').map((line: string) => {
      const fixed = fixDeprecatedApprovalPolicy(line)
      if (fixed !== line) deprecatedFixed = true
      return fixed
    }).join('\n')
    kept.push(fixedText)
  }
  return {
    project_text: kept.join('\n\n'),
    machine_text: moved.filter((item) => item.trim()).join('\n\n'),
    machine_blocks: machineBlocks,
    moved_keys: [...new Set(movedKeys)],
    moved_tables: [...new Set(movedTables)],
    profile_name: profileName,
    deprecated_approval_policy_fixed: deprecatedFixed
  }
}

function tomlBlocks(text: string) {
  const blocks: any[] = []
  let current = { table: '', lines: [] as string[] }
  for (const line of text.split('\n')) {
    const table = String(line).match(/^\s*\[([^\]]+)\]\s*$/)?.[1] || ''
    if (table) {
      blocks.push({ table: current.table, text: current.lines.join('\n') })
      current = { table, lines: [line] }
    } else {
      current.lines.push(line)
    }
  }
  blocks.push({ table: current.table, text: current.lines.join('\n') })
  return blocks.filter((block) => block.text.trim())
}

function isMachineLocalTable(table: string) {
  return MACHINE_LOCAL_TABLE_PREFIXES.some((prefix) => table === prefix || table.startsWith(`${prefix}.`))
}

function topLevelKey(line: string) {
  const match = String(line).match(/^\s*([A-Za-z0-9_\-.]+)\s*=/)
  return match?.[1] || ''
}

function tomlStringValue(line: string) {
  return String(line).match(/^\s*[A-Za-z0-9_\-.]+\s*=\s*"([^"]+)"/)?.[1] || null
}

function fixDeprecatedApprovalPolicy(line: string) {
  return String(line).replace(/^(\s*approval_policy\s*=\s*)"on-failure"(\s*(?:#.*)?)$/, '$1"on-request"$2')
}

function normalizeProjectText(text: string) {
  return `${String(text || '').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')}\n`
}

function profileTableBody(blocks: any[], profile: string) {
  const block = blocks.find((item) => item.table === `profiles.${profile}`)
  if (!block) return ''
  return block.text.split('\n').filter((line: string) => !/^\s*\[/.test(line)).join('\n')
}
