import path from 'node:path'
import os from 'node:os'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { repairAgentRoleConfigs } from '../agents/agent-role-config.js'
import { MANAGED_OFFICIAL_SUBAGENT_ROLES } from '../managed-assets/managed-assets-manifest.js'
import { messageOf } from '../errors/message.js'

const OFFICIAL_ROLES = MANAGED_OFFICIAL_SUBAGENT_ROLES.map((role) => role.codex_name)

interface CodexAgentRoleSyncReport {
  schema: 'sks.codex-agent-role-sync.v1'
  generated_at: string
  ok: boolean
  apply: boolean
  clobbered_user_roles: false
  codex_home: string
  official_roles: string[]
  directive_roles: string[]
  created: string[]
  updated: string[]
  base_repair: unknown
  blockers: string[]
}

export async function syncCodexAgentRoles(input: {
  root: string
  apply?: boolean
  codexHome?: string
}): Promise<CodexAgentRoleSyncReport> {
  const root = path.resolve(input.root)
  const codexHome = input.codexHome || process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  const baseRepair = await repairAgentRoleConfigs({
    root,
    apply: input.apply === true,
    codexHome,
    reportPath: path.join(root, '.sneakoscope', 'reports', 'agent-role-config-repair.json')
  }).catch((err: unknown) => ({ ok: false, blockers: [messageOf(err)] }))
  const created = stringList(baseRepair, 'created')
  const updated = stringList(baseRepair, 'repaired')
  const report: CodexAgentRoleSyncReport = {
    schema: 'sks.codex-agent-role-sync.v1',
    generated_at: nowIso(),
    ok: recordOk(baseRepair) !== false,
    apply: input.apply === true,
    clobbered_user_roles: false,
    codex_home: codexHome,
    official_roles: [...OFFICIAL_ROLES],
    directive_roles: [],
    created,
    updated,
    base_repair: baseRepair,
    blockers: blockersOf(baseRepair)
  }
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'codex-agent-role-sync.json'), report).catch(() => undefined)
  return report
}

function blockersOf(value: unknown): string[] {
  return Boolean(value) && typeof value === 'object' && Array.isArray((value as { blockers?: unknown }).blockers)
    ? ((value as { blockers: unknown[] }).blockers).map((item) => String(item)).filter(Boolean)
    : []
}

function recordOk(value: unknown): boolean | undefined {
  return Boolean(value) && typeof value === 'object' && typeof (value as { ok?: unknown }).ok === 'boolean'
    ? (value as { ok: boolean }).ok
    : undefined
}

function stringList(value: unknown, key: string): string[] {
  return Boolean(value) && typeof value === 'object' && Array.isArray((value as Record<string, unknown>)[key])
    ? ((value as Record<string, unknown>)[key] as unknown[]).map(String).filter(Boolean)
    : []
}
