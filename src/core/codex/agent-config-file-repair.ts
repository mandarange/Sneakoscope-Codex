import fs from 'node:fs/promises'
import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import {
  backupInvalidToml,
  inspectOfficialSubagentToml,
  mergeOfficialSubagentConfig,
  officialSubagentConfigOwnershipProof,
  officialSubagentConfigWarnings,
  readInheritedOfficialSubagentConfigText
} from '../subagents/official-subagent-config.js'
import { writeCodexConfigGuarded } from './codex-config-guard.js'

export interface AgentConfigFileRepairReport {
  schema: 'sks.agent-config-file-repair.v1'
  generated_at: string
  ok: boolean
  apply: boolean
  config_path: string
  backup_path: string | null
  repaired_paths: string[]
  created_files: string[]
  removed_unsupported_fields: string[]
  skipped_unmanaged_paths: string[]
  manual_required: boolean
  blockers: string[]
  warnings: string[]
  ownership_proof: {
    owned: boolean
    reasons: string[]
  }
}

/**
 * Compatibility entrypoint retained for doctor callers. It repairs the
 * official project [agents] settings and removes only exact legacy SKS child
 * tables after ownership has been proven. User-authored child tables remain.
 */
export async function repairAgentConfigFileReferences(input: {
  root: string
  apply?: boolean
  reportPath?: string | null
  home?: string
  codexHome?: string
}): Promise<AgentConfigFileRepairReport> {
  const root = path.resolve(input.root)
  const configPath = path.join(root, '.codex', 'config.toml')
  const configExists = await fs.stat(configPath).then((stat) => stat.isFile()).catch(() => false)
  const original = configExists ? await fs.readFile(configPath, 'utf8').catch(() => '') : ''
  const manifest = await readJson(path.join(root, '.sneakoscope', 'manifest.json'), null)
  const migrationReceipt = await readJson(path.join(root, '.sneakoscope', 'update', 'migration-receipt.json'), null)
  const ownershipProof = officialSubagentConfigOwnershipProof({
    text: original,
    manifest,
    migrationReceipt
  })
  const originalValidation = inspectOfficialSubagentToml(original)

  if (configExists && !originalValidation.ok) {
    const backupPath = input.apply
      ? await backupInvalidToml(configPath, original, 'doctor-project-config-invalid')
      : null
    return writeReport(input.reportPath, root, {
      schema: 'sks.agent-config-file-repair.v1',
      generated_at: nowIso(),
      ok: false,
      apply: input.apply === true,
      config_path: configPath,
      backup_path: backupPath,
      repaired_paths: [],
      created_files: [],
      removed_unsupported_fields: [],
      skipped_unmanaged_paths: [],
      manual_required: true,
      blockers: [
        'project_official_subagent_config_toml_parse_failed',
        ...(!ownershipProof.owned ? ['user_owned_file_without_sks_marker'] : [])
      ],
      warnings: [],
      ownership_proof: ownershipProof
    })
  }

  if (input.apply && configExists && !ownershipProof.owned) {
    return writeReport(input.reportPath, root, {
      schema: 'sks.agent-config-file-repair.v1',
      generated_at: nowIso(),
      ok: false,
      apply: true,
      config_path: configPath,
      backup_path: null,
      repaired_paths: [],
      created_files: [],
      removed_unsupported_fields: [],
      skipped_unmanaged_paths: [],
      manual_required: true,
      blockers: ['user_owned_file_without_sks_marker'],
      warnings: [],
      ownership_proof: ownershipProof
    })
  }

  const inheritedText = await readInheritedOfficialSubagentConfigText(configPath, {
    ...(input.home ? { home: input.home } : {}),
    ...(input.codexHome ? { codexHome: input.codexHome } : {})
  })
  const merged = mergeOfficialSubagentConfig(original, {
    sksOwned: ownershipProof.owned,
    inheritedText
  })
  const validation = inspectOfficialSubagentToml(merged)
  const warnings = officialSubagentConfigWarnings(merged, inheritedText)
  const blockers: string[] = []
  let changed = merged !== original
  let writeSucceeded = input.apply !== true
  let backupPath: string | null = null

  if (input.apply) {
    const guarded = await writeCodexConfigGuarded({
      root,
      configPath,
      before: original,
      cause: 'official-subagent-config-repair',
      ownershipVerified: ownershipProof.owned,
      mutate: () => merged
    })
    writeSucceeded = guarded.ok
    changed = guarded.ok && guarded.changed
    backupPath = guarded.backup_path
    if (!guarded.ok) blockers.push(`config_write_guard:${guarded.status}`)
  } else if (!validation.ok) {
    blockers.push('project_official_subagent_config_toml_parse_failed')
  }

  const report: AgentConfigFileRepairReport = {
    schema: 'sks.agent-config-file-repair.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    apply: input.apply === true,
    config_path: configPath,
    backup_path: backupPath,
    repaired_paths: changed && writeSucceeded ? [configPath] : [],
    created_files: input.apply === true && !configExists && changed && writeSucceeded ? [configPath] : [],
    removed_unsupported_fields: [],
    skipped_unmanaged_paths: [],
    manual_required: blockers.length > 0,
    blockers,
    warnings,
    ownership_proof: ownershipProof
  }
  return writeReport(input.reportPath, root, report)
}

// Retained for compatibility with the startup postcheck API. Official custom
// agents are discovered from .codex/agents and do not require config_file
// references; legacy references are intentionally ignored and preserved.
export async function missingAgentConfigFiles(_text: string): Promise<string[]> {
  return []
}

async function writeReport(
  reportPath: string | null | undefined,
  root: string,
  report: AgentConfigFileRepairReport
): Promise<AgentConfigFileRepairReport> {
  if (reportPath !== null) {
    await writeJsonAtomic(reportPath || path.join(root, '.sneakoscope', 'reports', 'agent-config-file-repair.json'), report).catch(() => undefined)
  }
  return report
}
