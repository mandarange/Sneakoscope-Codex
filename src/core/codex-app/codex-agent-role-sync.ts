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
  strategy: CodexAgentRolePayload['strategy']
  probe_artifact_path: string
  clobbered_user_roles: false
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
      if (current && !isSksManagedDirectiveRole(current)) continue
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
    strategy: agentTypeProbe.supported ? 'agent_type' : 'message-role',
    probe_artifact_path: '.sneakoscope/reports/codex-agent-type-probe.json',
    clobbered_user_roles: false,
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
  return [
    `name = "${role}"`,
    `description = "SKS managed 3.1.11 directive role: ${role}"`,
    'model_reasoning_effort = "medium"',
    role.includes('implementer') ? 'sandbox_mode = "workspace-write"' : 'sandbox_mode = "read-only"',
    'approval_policy = "never"',
    'developer_instructions = """',
    `You are ${role}. SKS managed 3.1.7 directive role with bounded ownership.`,
    'Bounded ownership: use only the assigned owner files/directories and treat memory as guidance, not permission.',
    role.includes('implementer') ? 'Maker/checker separation: implementer may patch only owner scope and cannot self-approve.' : 'Maker/checker separation: checker is read-only and must reject missing gates or missing proof artifacts.',
    role.includes('implementer') ? 'Allowed sandbox: workspace-write only within assigned owner scope.' : 'Allowed sandbox: read-only; checker roles cannot mutate.',
    role.includes('release') ? 'Release verifier: verify version truth, release DAG coverage, package scripts, packlist, and changelog evidence.' : '',
    role.includes('zellij') ? 'UI/Zellij verifier: inspect readiness status, headless fallback, repair_required, pane proof, and slot telemetry without mutating unrelated UI state.' : '',
    role.includes('codex') ? 'Codex native verifier: inspect hook approval, agent_type, skill sync, plugin inventory, MCP candidates, and invocation plan artifacts.' : '',
    'Side-effect restrictions: no destructive shell, package publish, global config mutation, database mutation, or external service write unless the sealed route contract explicitly allows it.',
    'Required proof artifacts: cite concrete repo paths, command outputs, and route-local JSON proof before claiming completion.',
    'Final arbiter constraints: parent integration owns final acceptance; this role supplies evidence and cannot override missing gates.',
    `Execution role strategy: ${payload?.strategy || 'message-role'}. Probe: ${payload?.probe_artifact_path || '.sneakoscope/reports/codex-agent-type-probe.json'}.`,
    '"""',
    ''
  ].join('\n')
}

function isSksManagedDirectiveRole(text: string): boolean {
  return /SKS managed 3\.1\.(?:4|5|6|7|11) (?:directive|bounded) role/.test(text)
    || /\bmessage_role_prefix\s*=/.test(text) && /SKS managed 3\.1\./.test(text)
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
