import path from 'node:path'
import os from 'node:os'
import { ensureDir, nowIso, readText, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import { writeCodexConfigGuarded } from '../codex/codex-config-guard.js'

export const DOCTOR_CONTEXT7_REPAIR_SCHEMA = 'sks.doctor-context7-repair.v1'
const CONTEXT7_REMOTE_URL = 'https://mcp.context7.com/mcp'

export interface DoctorContext7RepairResult {
  schema: typeof DOCTOR_CONTEXT7_REPAIR_SCHEMA
  ok: boolean
  generated_at: string
  fix: boolean
  preferred_transport: 'remote'
  configs: Array<{
    scope: 'project' | 'global'
    path: string
    present: boolean
    status: 'missing' | 'already_remote' | 'remote_child_env_detected' | 'local_stdio_detected' | 'repaired_to_remote' | 'blocked'
    changed: boolean
    backup_path: string | null
    warnings: string[]
    blockers: string[]
  }>
  actions: string[]
  blockers: string[]
  warnings: string[]
  report_path: string
}

export async function runDoctorContext7Repair(input: {
  root: string
  fix: boolean
  codexHome?: string
}): Promise<DoctorContext7RepairResult> {
  const root = path.resolve(input.root || process.cwd())
  const codexHome = input.codexHome || process.env.CODEX_HOME || path.join(process.env.HOME || os.homedir(), '.codex')
  const candidates = [
    { scope: 'project' as const, path: path.join(root, '.codex', 'config.toml') },
    { scope: 'global' as const, path: path.join(codexHome, 'config.toml') }
  ]
  const configs = []
  for (const candidate of candidates) configs.push(await inspectOrRepairContext7Config(root, candidate, input.fix))
  const blockers = configs.flatMap((entry) => entry.blockers.map((blocker) => `${entry.scope}:${blocker}`))
  const warnings = configs.flatMap((entry) => entry.warnings.map((warning) => `${entry.scope}:${warning}`))
  const actions = configs
    .filter((entry) => entry.changed || entry.status === 'local_stdio_detected')
    .map((entry) => entry.changed
      ? `${entry.scope} Context7 MCP migrated to remote transport`
      : `${entry.scope} Context7 MCP local stdio detected; rerun sks doctor --fix to migrate`)
  const reportPath = path.join(root, '.sneakoscope', 'reports', 'doctor-context7-repair.json')
  const result: DoctorContext7RepairResult = {
    schema: DOCTOR_CONTEXT7_REPAIR_SCHEMA,
    ok: blockers.length === 0,
    generated_at: nowIso(),
    fix: input.fix === true,
    preferred_transport: 'remote',
    configs,
    actions,
    blockers,
    warnings,
    report_path: reportPath
  }
  await writeJsonAtomic(reportPath, result)
  return result
}

async function inspectOrRepairContext7Config(root: string, candidate: { scope: 'project' | 'global'; path: string }, fix: boolean): Promise<DoctorContext7RepairResult['configs'][number]> {
  const text = await readText(candidate.path, null)
  if (text == null) {
    return baseConfig(candidate, {
      present: false,
      status: 'missing',
      warnings: candidate.scope === 'global' ? ['context7_global_config_missing_optional'] : []
    })
  }
  const block = context7Block(text)
  if (!block) return baseConfig(candidate, { present: true, status: 'missing' })
  if (/\burl\s*=\s*["']https:\/\/mcp\.context7\.com\/mcp["']/.test(block.text)) {
    const childBlocks = context7ChildBlocks(text)
    if (childBlocks.length) {
      if (!fix) {
        return baseConfig(candidate, {
          present: true,
          status: 'remote_child_env_detected',
          warnings: ['remote_context7_child_env_unsupported_by_streamable_http']
        })
      }
      const next = removeBlocks(text, childBlocks).replace(/\s*$/, '\n')
      const backupPath = await backupConfig(candidate.path, text)
      await writeCodexConfigGuarded({
        root,
        configPath: candidate.path,
        before: text,
        cause: 'doctor-context7-repair',
        mutate: () => next
      })
      return baseConfig(candidate, {
        present: true,
        status: 'repaired_to_remote',
        changed: true,
        backup_path: backupPath,
        warnings: ['remote_context7_child_env_removed']
      })
    }
    return baseConfig(candidate, { present: true, status: 'already_remote' })
  }
  const localStdio = /@upstash\/context7-mcp|context7-mcp|command\s*=\s*["']npx(?:\s|["'])/i.test(block.text)
  if (!localStdio) {
    return baseConfig(candidate, {
      present: true,
      status: 'blocked',
      blockers: ['context7_custom_config_preserved'],
      warnings: ['custom_context7_config_not_rewritten']
    })
  }
  if (!fix) {
    return baseConfig(candidate, {
      present: true,
      status: 'local_stdio_detected',
      warnings: ['local_stdio_context7_can_block_interactive_codex_launch']
    })
  }
  const remoteBlock = `[mcp_servers.context7]\nurl = "${CONTEXT7_REMOTE_URL}"\n`
  const withRemote = `${text.slice(0, block.start).trimEnd()}${block.start > 0 ? '\n\n' : ''}${remoteBlock}${text.slice(block.end).replace(/^\n+/, '\n')}`.replace(/\s*$/, '\n')
  const next = removeBlocks(withRemote, context7ChildBlocks(withRemote)).replace(/\s*$/, '\n')
  const backupPath = await backupConfig(candidate.path, text)
  await writeCodexConfigGuarded({
    root,
    configPath: candidate.path,
    before: text,
    cause: 'doctor-context7-repair',
    mutate: () => next
  })
  return baseConfig(candidate, {
    present: true,
    status: 'repaired_to_remote',
    changed: true,
    backup_path: backupPath,
    warnings: ['local_stdio_context7_replaced_with_remote_mcp']
  })
}

function context7ChildBlocks(text: string): Array<{ start: number; end: number; text: string }> {
  const blocks: Array<{ start: number; end: number; text: string }> = []
  const header = /(^|\n)\s*\[mcp_servers\.context7\.[^\]]+\]\s*(?:#.*)?(?:\n|$)/g
  let match: RegExpExecArray | null
  while ((match = header.exec(text))) {
    const start = match.index + (match[1] ? 1 : 0)
    const rest = text.slice(header.lastIndex)
    const nextHeader = rest.search(/\n\s*\[[^\]]+\]\s*(?:#.*)?(?:\n|$)/)
    const end = nextHeader >= 0 ? header.lastIndex + nextHeader : text.length
    blocks.push({ start, end, text: text.slice(start, end) })
  }
  return blocks
}

function removeBlocks(text: string, blocks: Array<{ start: number; end: number }>): string {
  return [...blocks]
    .sort((a, b) => b.start - a.start)
    .reduce((current, block) => `${current.slice(0, block.start).trimEnd()}${block.start > 0 ? '\n\n' : ''}${current.slice(block.end).replace(/^\n+/, '')}`, text)
}

function context7Block(text: string): { start: number; end: number; text: string } | null {
  const header = /(^|\n)\s*\[mcp_servers\.context7\]\s*(?:#.*)?(?:\n|$)/g
  const match = header.exec(text)
  if (!match) return null
  const start = match.index + (match[1] ? 1 : 0)
  const rest = text.slice(header.lastIndex)
  const nextHeader = rest.search(/\n\s*\[(?!mcp_servers\.context7(?:\.|\]))[^\]]+\]\s*(?:#.*)?(?:\n|$)/)
  const end = nextHeader >= 0 ? header.lastIndex + nextHeader : text.length
  return { start, end, text: text.slice(start, end) }
}

async function backupConfig(configPath: string, text: string): Promise<string | null> {
  try {
    const backupPath = `${configPath}.sks-context7-${Date.now().toString(36)}.bak`
    await ensureDir(path.dirname(backupPath))
    await writeTextAtomic(backupPath, text)
    return backupPath
  } catch {
    return null
  }
}

function baseConfig(
  candidate: { scope: 'project' | 'global'; path: string },
  patch: Partial<DoctorContext7RepairResult['configs'][number]>
): DoctorContext7RepairResult['configs'][number] {
  return {
    scope: candidate.scope,
    path: candidate.path,
    present: patch.present === true,
    status: patch.status || 'missing',
    changed: patch.changed === true,
    backup_path: patch.backup_path || null,
    warnings: patch.warnings || [],
    blockers: patch.blockers || []
  }
}
