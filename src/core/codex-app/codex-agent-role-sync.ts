import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { nowIso, writeJsonAtomic, writeTextAtomic, ensureDir } from '../fsx.js'
import { repairAgentRoleConfigs } from '../agents/agent-role-config.js'
import { agentRolePayloadFor, probeCodexAgentTypeSupport } from './codex-agent-type-probe.js'
import type { CodexAgentRolePayload, CodexAgentTypeProbe } from './codex-app-types.js'

const DIRECTIVE_ROLES = [
  'sks-explorer',
  'sks-planner',
  'sks-implementer',
  'sks-checker',
  'sks-release-verifier',
  'sks-zellij-ui-verifier',
  'sks-codex-probe-verifier'
]

interface CodexAgentRoleSyncReport {
  schema: 'sks.codex-agent-role-sync.v1'
  generated_at: string
  ok: boolean
  apply: boolean
  agent_type_supported: boolean
  fallback: CodexAgentRolePayload['strategy']
  codex_home: string
  directive_roles: string[]
  role_payloads: Record<string, CodexAgentRolePayload>
  agent_type_probe: CodexAgentTypeProbe
  created: string[]
  base_repair: unknown
  blockers: string[]
}

export async function syncCodexAgentRoles(input: {
  root: string
  apply?: boolean
  codexHome?: string
  agentTypeSupported?: boolean
  env?: NodeJS.ProcessEnv
}): Promise<CodexAgentRoleSyncReport> {
  const root = path.resolve(input.root)
  const env = input.env || process.env
  const codexHome = input.codexHome || process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  const targetDir = path.join(codexHome, 'agents')
  const baseRepair = await repairAgentRoleConfigs({
    root,
    apply: input.apply === true,
    codexHome,
    reportPath: path.join(root, '.sneakoscope', 'reports', 'agent-role-config-repair.json')
  }).catch((err: unknown) => ({ ok: false, blockers: [messageOf(err)] }))
  const agentTypeProbe = input.agentTypeSupported === undefined
    ? await probeCodexAgentTypeSupport(root, { env }).catch((err: unknown) => ({
      schema: 'sks.codex-agent-type-probe.v1' as const,
      generated_at: nowIso(),
      ok: false,
      supported: false,
      source: 'unknown' as const,
      spawn_tool_name: 'unknown' as const,
      schema_path: null,
      evidence: [],
      blockers: [messageOf(err)],
      warnings: ['agent_type_probe_failed_message_role_fallback']
    }))
    : {
      schema: 'sks.codex-agent-type-probe.v1' as const,
      generated_at: nowIso(),
      ok: true,
      supported: input.agentTypeSupported,
      source: 'fixture' as const,
      spawn_tool_name: input.agentTypeSupported ? 'spawn_agent' as const : 'unknown' as const,
      schema_path: input.agentTypeSupported ? 'input.agentTypeSupported' : null,
      evidence: [`input.agentTypeSupported=${input.agentTypeSupported}`],
      blockers: [],
      warnings: []
    }
  const rolePayloads = Object.fromEntries(DIRECTIVE_ROLES.map((role) => [role, agentRolePayloadFor(role, agentTypeProbe)]))
  const created: string[] = []
  if (input.apply === true) {
    await ensureDir(targetDir)
    for (const role of DIRECTIVE_ROLES) {
      const file = path.join(targetDir, `${role}.toml`)
      const current = await fs.readFile(file, 'utf8').catch(() => '')
      if (current && !current.includes('SKS managed 3.1.4 directive role') && !current.includes('SKS managed 3.1.5 directive role')) continue
      await writeTextAtomic(file, roleToml(role, rolePayloads[role]))
      created.push(file)
    }
  }
  const report: CodexAgentRoleSyncReport = {
    schema: 'sks.codex-agent-role-sync.v1',
    generated_at: nowIso(),
    ok: recordOk(baseRepair) !== false && agentTypeProbe.ok !== false,
    apply: input.apply === true,
    agent_type_supported: agentTypeProbe.supported,
    fallback: agentTypeProbe.supported ? 'agent_type' : 'message-role',
    codex_home: codexHome,
    directive_roles: DIRECTIVE_ROLES,
    role_payloads: rolePayloads as Record<string, CodexAgentRolePayload>,
    agent_type_probe: agentTypeProbe,
    created,
    base_repair: baseRepair,
    blockers: blockersOf(baseRepair)
  }
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'codex-agent-role-sync.json'), report).catch(() => undefined)
  return report
}

function roleToml(role: string, payload: CodexAgentRolePayload | undefined): string {
  const strategyLine = payload?.strategy === 'agent_type'
    ? `agent_type = "${payload.agent_type || role}"`
    : `message_role_prefix = "${escapeToml(payload?.message_role_prefix || `Role: ${role}.`)}"`
  return [
    `name = "${role}"`,
    `description = "SKS managed 3.1.5 directive role: ${role}"`,
    strategyLine,
    'model_reasoning_effort = "medium"',
    role.includes('implementer') ? 'sandbox_mode = "workspace-write"' : 'sandbox_mode = "read-only"',
    'approval_policy = "never"',
    'developer_instructions = """',
    `You are ${role}. SKS managed 3.1.5 directive role.`,
    'Use the assigned scope only, cite concrete repo evidence, keep mutation surfaces bounded, and never clobber user files.',
    'Report blockers as evidence-backed findings and write route artifacts before claiming completion.',
    `Execution role strategy: ${payload?.strategy || 'message-role'}. Probe: ${payload?.probe_artifact_path || '.sneakoscope/reports/codex-agent-type-probe.json'}.`,
    '"""',
    ''
  ].join('\n')
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

function escapeToml(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
