import fs from 'node:fs'
import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import {
  MANAGED_AGENT_ROLES,
  MANAGED_OFFICIAL_SUBAGENT_ROLES,
  managedAgentRoleByFile,
  managedAgentRoleByName,
  managedAgentRoleContent,
  managedOfficialSubagentRoleByFile,
  managedOfficialSubagentRoleByName,
  managedOfficialSubagentRoleContent
} from '../managed-assets/managed-assets-manifest.js'
import { installOfficialSubagentAgentConfigs } from '../subagents/official-subagent-config.js'

export const AGENT_ROLE_CONFIG_REPAIR_SCHEMA = 'sks.agent-role-config-repair.v1'

export const SKS_OWNED_AGENT_CONFIGS = new Map<string, {
  name: string
  sandbox: 'read-only' | 'workspace-write' | null
  content: string
  id: string
}>([
  ...MANAGED_OFFICIAL_SUBAGENT_ROLES.map((role) => [
    role.filename,
    { name: role.codex_name, sandbox: null, content: managedOfficialSubagentRoleContent(role), id: role.id }
  ] as const),
  ...MANAGED_AGENT_ROLES.map((role) => [
    role.filename,
    { name: role.codex_name, sandbox: role.sandbox, content: managedAgentRoleContent(role), id: role.id }
  ] as const)
])

export function managedAgentRoleConfigForFile(file: string): string | null {
  const official = managedOfficialSubagentRoleByFile(file)
  if (official) return managedOfficialSubagentRoleContent(official)
  const role = managedAgentRoleByFile(file)
  return role ? managedAgentRoleContent(role) : null
}

export function managedAgentRoleConfigForRole(role: string): { file: string; content: string } | null {
  const official = managedOfficialSubagentRoleByName(role)
  if (official) return { file: official.filename, content: managedOfficialSubagentRoleContent(official) }
  const match = managedAgentRoleByName(role)
  return match ? { file: match.filename, content: managedAgentRoleContent(match) } : null
}

export async function repairAgentRoleConfigs(input: {
  root: string
  apply?: boolean
  reportPath?: string
  codexHome?: string
}) {
  const root = path.resolve(input.root)
  const codexHome = input.codexHome || process.env.CODEX_HOME || path.join(process.env.HOME || '', '.codex')
  const candidates = [path.join(root, '.codex', 'agents'), path.join(codexHome, 'agents')]
  const officialRepair = await installOfficialSubagentAgentConfigs(root, { apply: input.apply === true })
  const missing: string[] = [...officialRepair.missing]
  const stale: string[] = [...officialRepair.stale]
  const created: string[] = [...officialRepair.created]
  const repaired: string[] = [...officialRepair.updated]
  const existing: string[] = [...officialRepair.existing]
  const manualBlockers: string[] = [...officialRepair.manual_blockers]
  // Legacy role TOMLs are compatibility/user surfaces only in 6.1.1. Inventory
  // them when present, but never create, normalize, or overwrite them.
  for (const role of MANAGED_AGENT_ROLES) {
    const file = role.filename
    const foundPaths = candidates.map((dir) => path.join(dir, file)).filter((filePath) => fs.existsSync(filePath))
    for (const foundPath of foundPaths) {
      existing.push(path.relative(root, foundPath) || foundPath)
    }
  }
  const requiredFixes = missing.length + stale.length
  const appliedFixes = created.length + repaired.length
  const report = {
    schema: AGENT_ROLE_CONFIG_REPAIR_SCHEMA,
    generated_at: nowIso(),
    ok: input.apply ? requiredFixes === appliedFixes && manualBlockers.length === 0 : manualBlockers.length === 0,
    apply: input.apply === true,
    missing,
    stale,
    existing,
    created,
    repaired,
    backups: officialRepair.backups,
    manual_blockers: manualBlockers,
    manifest_role_ids: MANAGED_OFFICIAL_SUBAGENT_ROLES.map((role) => role.id),
    legacy_compatibility_role_ids: MANAGED_AGENT_ROLES.map((role) => role.id),
    warnings_suppressed: true,
    blockers: [
      ...manualBlockers,
      ...(input.apply && requiredFixes !== appliedFixes ? ['agent_role_config_repair_incomplete'] : [])
    ]
  }
  if (input.reportPath) await writeJsonAtomic(input.reportPath, report)
  return report
}
