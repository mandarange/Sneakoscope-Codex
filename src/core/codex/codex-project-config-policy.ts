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
  'api_key',
  'openai_api_key',
  'chatgpt_api_key',
  'auth',
  'auth_file',
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
  const parseSmoke = tomlRewriteSmoke(projectText)
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
    const dedupedUser = removeConfigIds(String(currentUser || ''), configIds(split.machine_text))
    const movedBlock = [
      '',
      `# SKS moved machine-local Codex config from ${path.relative(root, configPath) || configPath} at ${nowIso()}`,
      split.machine_text.trim(),
      ''
    ].join('\n')
    await writeTextAtomic(userConfigPath, `${dedupedUser.replace(/\s+$/, '')}${movedBlock}`.replace(/^\n+/, ''))
    actions.push('machine_local_keys_moved_to_codex_home_config')
  }

  if (profileName) actions.push('legacy_project_profile_selector_removed')

  const report = {
    schema: CODEX_PROJECT_CONFIG_POLICY_SCHEMA,
    generated_at: nowIso(),
    root,
    config_path: configPath,
    codex_home: codexHome,
    ok: parseSmoke.ok && split.blockers.length === 0,
    changed,
    applied: opts.apply === true,
    backup_path: backupPath,
    user_config_path: userConfigPath,
    profile_config_path: profileConfigPath,
    profile_name: profileName,
    migration_artifact: {
      moved: split.moved_keys.concat(split.moved_tables),
      removed: profileName ? ['project_local_profile_selector'] : [],
      kept: split.kept_keys
    },
    moved_keys: split.moved_keys,
    moved_tables: split.moved_tables,
    deprecated_approval_policy_fixed: split.deprecated_approval_policy_fixed,
    actions,
    parse_smoke: parseSmoke,
    blockers: [...split.blockers, ...(parseSmoke.ok ? [] : ['project_config_rewrite_parse_smoke_failed'])]
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
  const blockers: string[] = []
  let profileName: string | null = null
  let deprecatedFixed = false

  for (const block of blocks) {
    if (block.table && isMachineLocalTable(block.table)) {
      if (block.array) {
        kept.push(block.text)
        blockers.push(`unsupported_machine_local_table_array:${block.table}`)
        continue
      }
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
    kept_keys: [],
    profile_name: profileName,
    deprecated_approval_policy_fixed: deprecatedFixed,
    blockers: [...new Set(blockers)]
  }
}

function tomlBlocks(text: string) {
  const blocks: any[] = []
  let current = { table: '', array: false, lines: [] as string[] }
  let multiline: string | null = null
  for (const line of text.split('\n')) {
    const tableHeader = !multiline ? String(line).match(/^\s*(\[\[?)([^\]]+)\]\]?\s*(?:#.*)?$/) : null
    const table = tableHeader?.[2] || ''
    if (table) {
      blocks.push({ table: current.table, array: current.array, text: current.lines.join('\n') })
      current = { table, array: tableHeader?.[1] === '[[', lines: [line] }
    } else {
      current.lines.push(line)
    }
    multiline = updateMultilineState(line, multiline)
  }
  blocks.push({ table: current.table, array: current.array, text: current.lines.join('\n') })
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
  const deprecated = `${'on'}-failure`
  return String(line).replace(new RegExp(`^(\\s*approval_policy\\s*=\\s*)"${deprecated}"(\\s*(?:#.*)?)$`), '$1"on-request"$2')
}

function normalizeProjectText(text: string) {
  return `${String(text || '').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')}\n`
}

function updateMultilineState(line: string, current: string | null) {
  const text = stripCommentOutsideQuotes(String(line))
  const tokens = [...text.matchAll(/('''|""")/g)].map((match) => String(match[1] || ''))
  let state = current
  for (const token of tokens) {
    if (!state) state = token
    else if (state === token) state = null
  }
  return state
}

function stripCommentOutsideQuotes(line: string) {
  let quote = ''
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if ((ch === '"' || ch === "'") && line.slice(i, i + 3) !== `${ch}${ch}${ch}`) quote = quote === ch ? '' : quote || ch
    if (ch === '#' && !quote) return line.slice(0, i)
  }
  return line
}

function tomlRewriteSmoke(text: string) {
  let triple: string | null = null
  for (const line of String(text || '').split('\n')) triple = updateMultilineState(line, triple)
  const badHeader = String(text || '').split('\n').find((line) => /^\s*\[/.test(line) && !/^\s*\[\[?[^\]]+\]\]?\s*(?:#.*)?$/.test(line))
  return {
    ok: !triple && !badHeader,
    unterminated_multiline_string: Boolean(triple),
    invalid_table_header: badHeader || null
  }
}

function profileTableBody(blocks: any[], profile: string) {
  const block = blocks.find((item) => item.table === `profiles.${profile}`)
  if (!block) return ''
  return block.text.split('\n').filter((line: string) => !/^\s*\[/.test(line)).join('\n')
}

function configIds(text: string) {
  const ids = { keys: new Set<string>(), tables: new Set<string>() }
  for (const block of tomlBlocks(text)) {
    if (block.table) {
      ids.tables.add(block.table)
      continue
    }
    for (const line of block.text.split('\n')) {
      const key = topLevelKey(line)
      if (key) ids.keys.add(key)
    }
  }
  return ids
}

function removeConfigIds(text: string, ids: { keys: Set<string>; tables: Set<string> }) {
  const kept: string[] = []
  for (const block of tomlBlocks(text)) {
    if (block.table && ids.tables.has(block.table)) continue
    if (!block.table) {
      const lines = block.text.split('\n').filter((line: string) => {
        const key = topLevelKey(line)
        return !key || !ids.keys.has(key)
      })
      if (lines.some((line: string) => line.trim())) kept.push(lines.join('\n'))
      continue
    }
    kept.push(block.text)
  }
  return normalizeProjectText(kept.join('\n\n'))
}
