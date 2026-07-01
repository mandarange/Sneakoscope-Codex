import { REQUIRED_CODEX_MODEL } from '../codex-model-guard.js'

export const MANAGED_ASSET_SCHEMA_VERSION = 1
export const MANAGED_ASSET_VERSION = '4.8.0'
export const MANAGED_ASSET_MARKER = 'SKS-MANAGED-ASSET'

export type ManagedAssetRisk = 'read-only' | 'managed-write' | 'user-confirmation' | 'manual'
export type ManagedAgentSandbox = 'read-only' | 'workspace-write'

export interface ManagedAgentRole {
  id: string
  legacy_ids: string[]
  filename: string
  aliases: string[]
  codex_name: string
  description: string
  sandbox: ManagedAgentSandbox
  permission_profile: string
  legacy_sandbox_projection: ManagedAgentSandbox
  required_for: string[]
  ownership_marker: string
  schema_version: number
}

export interface ManagedSkillAsset {
  id: string
  required_for: string[]
}

export interface ManagedHookAsset {
  id: string
  required_for: string[]
  risk: ManagedAssetRisk
}

export const MANAGED_AGENT_ROLES: readonly ManagedAgentRole[] = Object.freeze([
  role('sks-explorer', 'analysis-scout.toml', 'analysis_scout', 'SKS analysis scout for bounded read/write slices retained for stale Codex agent-role config repair.', 'workspace-write', ['analysis-scout', 'analysis_scout']),
  role('sks-native-agent', 'native-agent-intake.toml', 'native_agent', 'SKS native agent for bounded read/write intake slices.', 'workspace-write', ['native-agent-intake', 'native_agent']),
  role('sks-planner', 'team-consensus.toml', 'team_consensus', 'Planning and debate specialist for bounded SKS Team mode write sets.', 'workspace-write', ['team-consensus', 'team_consensus']),
  role('sks-implementer', 'implementation-worker.toml', 'implementation_worker', 'Implementation specialist for bounded SKS Team write sets.', 'workspace-write', ['implementation-worker', 'implementation_worker']),
  role('sks-checker', 'qa-reviewer.toml', 'qa_reviewer', 'Strict verification reviewer for correctness, regressions, and final evidence with bounded write capability.', 'workspace-write', ['qa-reviewer', 'qa_reviewer']),
  role('sks-release-verifier', 'sks-release-verifier.toml', 'sks_release_verifier', 'Release verifier for repository, docs, tests, API, and risk slices with bounded write capability.', 'workspace-write', ['release-verifier']),
  role('sks-zellij-ui-verifier', 'sks-zellij-ui-verifier.toml', 'sks_zellij_ui_verifier', 'Zellij UI verifier for session, pane, layout, and terminal evidence with bounded write capability.', 'workspace-write', ['zellij-ui-verifier']),
  role('sks-codex-probe-verifier', 'sks-codex-probe-verifier.toml', 'sks_codex_probe_verifier', 'Codex probe verifier for CLI, App, SDK, MCP, and native capability evidence with bounded write capability.', 'workspace-write', ['codex-probe-verifier']),
  role('db-safety-reviewer', 'db-safety-reviewer.toml', 'db_safety_reviewer', 'Database safety reviewer for SQL, migrations, Supabase, and rollback safety with bounded write capability.', 'workspace-write', ['db-safety-reviewer', 'db_safety_reviewer'])
])

export const MANAGED_SKILLS: readonly ManagedSkillAsset[] = Object.freeze([
  'loop',
  'naruto',
  'qa-loop',
  'research',
  'dfix',
  'image-ux-review',
  'computer-use',
  'init-deep'
].map((id) => ({ id, required_for: ['codex-native-runtime'] })))

export const MANAGED_HOOKS: readonly ManagedHookAsset[] = Object.freeze([
  { id: 'version-guard', required_for: ['managed-state-current'], risk: 'managed-write' },
  { id: 'user-prompt-submit', required_for: ['route-intake'], risk: 'managed-write' },
  { id: 'stop', required_for: ['route-finalization'], risk: 'managed-write' }
])

export const CONTEXT7_MANAGED_SERVER = Object.freeze({
  id: 'context7',
  required: true,
  transport: 'remote',
  url: 'https://mcp.context7.com/mcp',
  local_fallback: {
    transport: 'local',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp@latest']
  },
  purpose: 'Current library/API/framework documentation for route gates.'
})

export function managedAgentRoleByFile(filename: string): ManagedAgentRole | null {
  const base = filename.split(/[\\/]/).pop() || filename
  assertUniqueManagedAgentRoleFilenames()
  return MANAGED_AGENT_ROLES.find((role) => role.filename === base) || null
}

export function managedAgentRoleByName(name: string): ManagedAgentRole | null {
  const normalized = normalizeRoleName(name)
  return MANAGED_AGENT_ROLES.find((role) => [
    role.id,
    role.codex_name,
    role.filename.replace(/\.toml$/i, ''),
    ...role.aliases,
    ...role.legacy_ids
  ].map(normalizeRoleName).includes(normalized)) || null
}

export function managedAgentRoleContent(role: ManagedAgentRole): string {
  return [
    `# ${MANAGED_ASSET_MARKER}`,
    `# sks_managed_schema = ${role.schema_version}`,
    `# sks_managed_id = "${role.id}"`,
    `# sks_managed_version = "${MANAGED_ASSET_VERSION}"`,
    `name = "${role.codex_name}"`,
    `description = "${role.description}"`,
    `model = "${REQUIRED_CODEX_MODEL}"`,
    'model_reasoning_effort = "medium"',
    `sandbox_mode = "${role.sandbox}"`,
    `permission_profile = "${role.permission_profile}"`,
    `legacy_sandbox_projection = "${role.legacy_sandbox_projection}"`,
    'developer_instructions = """',
    `You are the SKS ${role.id} role.`,
    role.sandbox === 'read-only' ? 'Do not edit files.' : 'Only edit the bounded files assigned by the parent orchestrator.',
    'Return concise source-backed findings and LIVE_EVENT lines when applicable.',
    '"""',
    ''
  ].join('\n')
}

export function managedAgentRoleOwnsText(text: string, role: ManagedAgentRole): boolean {
  const hasManagedMarker = text.includes(MANAGED_ASSET_MARKER)
    && text.includes(`sks_managed_id = "${role.id}"`)
    && text.includes(`name = "${role.codex_name}"`)
    && text.includes(`sandbox_mode = "${role.sandbox}"`)
  const legacyCompatible = text.includes(`name = "${role.codex_name}"`)
    && text.includes(`sandbox_mode = "${role.sandbox}"`)
    && text.includes(`model = "${REQUIRED_CODEX_MODEL}"`)
  return hasManagedMarker || legacyCompatible
}

export function normalizeRoleName(name: string): string {
  return String(name || '').trim().replace(/\.toml$/i, '').replace(/_/g, '-').toLowerCase()
}

export function assertUniqueManagedAgentRoleFilenames(): void {
  const seen = new Map<string, string>()
  for (const role of MANAGED_AGENT_ROLES) {
    const existing = seen.get(role.filename)
    if (existing) throw new Error(`duplicate managed agent role filename: ${role.filename} for ${existing} and ${role.id}`)
    seen.set(role.filename, role.id)
  }
}

function role(
  id: string,
  filename: string,
  codexName: string,
  description: string,
  sandbox: ManagedAgentSandbox,
  aliases: string[]
): ManagedAgentRole {
  return {
    id,
    legacy_ids: aliases,
    filename,
    aliases,
    codex_name: codexName,
    description,
    sandbox,
    permission_profile: sandbox === 'read-only' ? 'sks-readonly' : 'sks-workspace-write',
    legacy_sandbox_projection: sandbox,
    required_for: ['codex-native-runtime'],
    ownership_marker: MANAGED_ASSET_MARKER,
    schema_version: MANAGED_ASSET_SCHEMA_VERSION
  }
}
