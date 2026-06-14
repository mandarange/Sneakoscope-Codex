// @ts-nocheck
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { nowIso, writeJsonAtomic, writeTextAtomic, ensureDir } from '../fsx.js'
import { repairAgentRoleConfigs } from '../agents/agent-role-config.js'

const DIRECTIVE_ROLES = [
  'sks-explorer',
  'sks-planner',
  'sks-implementer',
  'sks-checker',
  'sks-release-verifier',
  'sks-zellij-ui-verifier',
  'sks-codex-probe-verifier'
]

export async function syncCodexAgentRoles(input: {
  root: string
  apply?: boolean
  codexHome?: string
  agentTypeSupported?: boolean
}): Promise<any> {
  const root = path.resolve(input.root)
  const codexHome = input.codexHome || process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  const targetDir = path.join(codexHome, 'agents')
  const baseRepair = await repairAgentRoleConfigs({
    root,
    apply: input.apply === true,
    codexHome,
    reportPath: path.join(root, '.sneakoscope', 'reports', 'agent-role-config-repair.json')
  }).catch((err: any) => ({ ok: false, blockers: [err?.message || String(err)] }))
  const created: string[] = []
  if (input.apply === true) {
    await ensureDir(targetDir)
    for (const role of DIRECTIVE_ROLES) {
      const file = path.join(targetDir, `${role}.toml`)
      const current = await fs.readFile(file, 'utf8').catch(() => '')
      if (current && !current.includes('SKS managed 3.1.4 directive role')) continue
      await writeTextAtomic(file, roleToml(role))
      created.push(file)
    }
  }
  const report = {
    schema: 'sks.codex-agent-role-sync.v1',
    generated_at: nowIso(),
    ok: baseRepair.ok !== false,
    apply: input.apply === true,
    agent_type_supported: input.agentTypeSupported === true || process.env.SKS_CODEX_AGENT_TYPE_SUPPORTED === '1',
    fallback: (input.agentTypeSupported === true || process.env.SKS_CODEX_AGENT_TYPE_SUPPORTED === '1') ? 'agent_type' : 'message-role',
    codex_home: codexHome,
    directive_roles: DIRECTIVE_ROLES,
    created,
    base_repair: baseRepair,
    blockers: baseRepair.blockers || []
  }
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'codex-agent-role-sync.json'), report).catch(() => undefined)
  return report
}

function roleToml(role: string) {
  return [
    `name = "${role}"`,
    `description = "SKS managed 3.1.4 directive role: ${role}"`,
    'model_reasoning_effort = "medium"',
    role.includes('implementer') ? 'sandbox_mode = "workspace-write"' : 'sandbox_mode = "read-only"',
    'approval_policy = "never"',
    'developer_instructions = """',
    `You are ${role}. SKS managed 3.1.4 directive role. Respect bounded ownership and never clobber user files.`,
    '"""',
    ''
  ].join('\n')
}
