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
  const codexHomeConfigPath = path.join(codexHome, 'config.toml')
  // Guard: never split the global Codex home config against itself. When `sks`
  // runs from (or near) the home directory the project config can resolve to the
  // same file as the move target. Splitting it would strip machine-local keys and
  // re-append them, corrupting the file. Treat this as a no-op.
  if (await isSameFile(configPath, codexHomeConfigPath)) {
    const report = {
      schema: CODEX_PROJECT_CONFIG_POLICY_SCHEMA,
      generated_at: nowIso(),
      root,
      config_path: configPath,
      codex_home: codexHome,
      ok: true,
      status: 'project_config_is_codex_home_noop',
      changed: false,
      moved_keys: [],
      moved_tables: [],
      actions: [],
      blockers: []
    }
    if (opts.writeReport !== false) await writeJsonAtomic(reportPath, { ...report, report_path: reportPath })
    return report
  }
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
    userConfigPath = codexHomeConfigPath
    const currentUser = await readText(userConfigPath, '')
    const dedupedUser = removeConfigIds(String(currentUser || ''), configIds(split.machine_text))
    const commentLine = `# SKS moved machine-local Codex config from ${path.relative(root, configPath) || configPath} at ${nowIso()}`
    const mergedUser = mergeMachineLocalIntoUserConfig(dedupedUser, split.machine_text.trim(), commentLine)
    await writeTextAtomic(userConfigPath, mergedUser)
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

// Recovery pass for already-corrupted configs. The pre-fix mover appended
// machine-local top-level keys after the last [table], so TOML absorbed them
// into that table (e.g. `notify`/`model_provider` landing inside
// `[mcp_servers.*.env]`, which Codex rejects with
// `invalid type: sequence, expected a string`). The splitter cannot recover this
// because it now sees those lines as table members, not top-level keys. This pass
// hoists them back above the first table so Codex can load the config again.
export async function repairCodexConfigStructure(configPathInput: string, opts: any = {}) {
  const configPath = path.resolve(configPathInput)
  const original = await readText(configPath, null)
  if (original === null) {
    return { config_path: configPath, ok: true, status: 'config_missing', changed: false, applied: false, hoisted_keys: [], backup_path: null }
  }
  const hoist = hoistMisplacedMachineLocalKeys(String(original))
  let backupPath: string | null = null
  if (opts.apply && hoist.changed) {
    backupPath = `${configPath}.struct-bak-${Date.now().toString(36)}`
    await ensureDir(path.dirname(configPath))
    await fsp.copyFile(configPath, backupPath)
    await writeTextAtomic(configPath, hoist.text)
  }
  const parseSmoke = tomlRewriteSmoke(hoist.text)
  return {
    config_path: configPath,
    ok: parseSmoke.ok,
    status: hoist.changed ? (opts.apply ? 'structure_repaired' : 'structure_repair_available') : 'structure_ok',
    changed: hoist.changed,
    applied: opts.apply === true && hoist.changed,
    hoisted_keys: hoist.hoisted_keys,
    backup_path: backupPath,
    parse_smoke: parseSmoke
  }
}

function hoistMisplacedMachineLocalKeys(text: string) {
  const blocks = tomlBlocks(text)
  const preamble: string[] = []
  const tables: string[] = []
  const hoisted: string[] = []
  const hoistedKeys: string[] = []
  for (const block of blocks) {
    if (!block.table) {
      preamble.push(block.text)
      continue
    }
    const lines = block.text.split('\n')
    const header = lines[0]
    // `mcp_servers.*` / `*.env` tables never legitimately contain machine-local
    // Codex root keys; treat keys found there (or anything after an absorbed
    // SKS-moved comment) as misplaced.
    const corruptionProne = /^mcp_servers(\.|$)/.test(block.table) || /\.env$/.test(block.table) || block.table === 'env'
    const kept: string[] = [header]
    let sawMovedComment = false
    let i = 1
    while (i < lines.length) {
      const line = lines[i]
      if (/^\s*#\s*SKS moved machine-local Codex config/i.test(line)) {
        sawMovedComment = true
        i += 1
        continue
      }
      const key = topLevelKey(line)
      const isMachineKey = Boolean(key) && MACHINE_LOCAL_TOP_LEVEL_KEYS.has(key)
      if (isMachineKey && (corruptionProne || sawMovedComment)) {
        const span = captureAssignmentSpan(lines, i)
        for (const spanned of span.lines) hoisted.push(spanned)
        hoistedKeys.push(key)
        i = span.next
        continue
      }
      kept.push(line)
      i += 1
    }
    tables.push(kept.join('\n'))
  }
  if (!hoisted.length) return { changed: false, text, hoisted_keys: [] as string[] }
  const head = [preamble.join('\n').trim(), hoisted.join('\n').trim()].filter(Boolean).join('\n')
  const sections = [head, ...tables.map((table) => table.trim())].filter(Boolean)
  return { changed: true, text: normalizeProjectText(sections.join('\n\n')), hoisted_keys: [...new Set(hoistedKeys)] }
}

// Capture a TOML assignment that may span multiple lines (multiline arrays
// `[ ... ]` or triple-quoted strings) so hoisting never splits a value.
function captureAssignmentSpan(lines: string[], start: number) {
  const first = lines[start] ?? ''
  const collected = [first]
  let next = start + 1
  let triple = updateMultilineState(first, null)
  let bracketDepth = bracketDelta(first)
  while ((triple || bracketDepth > 0) && next < lines.length) {
    const line = lines[next] ?? ''
    collected.push(line)
    triple = updateMultilineState(line, triple)
    bracketDepth += bracketDelta(line)
    next += 1
  }
  return { lines: collected, next }
}

function bracketDelta(line: string) {
  const noComment = stripCommentOutsideQuotes(String(line))
  const noStrings = noComment.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '')
  let delta = 0
  for (const ch of noStrings) {
    if (ch === '[') delta += 1
    else if (ch === ']') delta -= 1
  }
  return delta
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

async function isSameFile(a: string, b: string) {
  const ra = path.resolve(a)
  const rb = path.resolve(b)
  if (ra === rb) return true
  try {
    const [realA, realB] = await Promise.all([fsp.realpath(ra), fsp.realpath(rb)])
    return realA === realB
  } catch {
    return false
  }
}

// Merge machine-local Codex config into the user (CODEX_HOME) config while
// preserving TOML structure: bare top-level keys must appear before any
// `[table]` header, otherwise they are parsed as members of the preceding
// table. Appending moved keys blindly at end-of-file corrupted configs
// (e.g. `notify`/`model_provider` landing inside `[mcp_servers.*.env]`).
function mergeMachineLocalIntoUserConfig(userText: string, machineText: string, commentLine: string) {
  const preamble: string[] = []
  const tables: string[] = []
  collectTomlSections(userText, preamble, tables)
  const movedPreamble: string[] = []
  const movedTables: string[] = []
  collectTomlSections(machineText, movedPreamble, movedTables)

  const head: string[] = []
  const existingHead = preamble.join('\n').trim()
  if (existingHead) head.push(existingHead)
  const movedHead = movedPreamble.join('\n').trim()
  if (commentLine && (movedHead || movedTables.length)) head.push(commentLine)
  if (movedHead) head.push(movedHead)

  const sections: string[] = []
  const headText = head.join('\n').trim()
  if (headText) sections.push(headText)
  for (const table of [...tables, ...movedTables]) {
    const trimmed = table.trim()
    if (trimmed) sections.push(trimmed)
  }
  return normalizeProjectText(sections.join('\n\n'))
}

function collectTomlSections(text: string, preamble: string[], tables: string[]) {
  for (const block of tomlBlocks(text)) {
    if (block.table) tables.push(block.text)
    else preamble.push(block.text)
  }
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
