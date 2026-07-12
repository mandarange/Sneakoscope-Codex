import { sha256 } from '../fsx.js'

export const MANAGED_ASSET_SCHEMA_VERSION = 1
export const MANAGED_ASSET_VERSION = '6.1.1'
export const MANAGED_ASSET_MARKER = 'SKS-MANAGED-ASSET'
export const MANAGED_OFFICIAL_SUBAGENT_MARKER = 'SKS-MANAGED-OFFICIAL-SUBAGENT'

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
  required_for: string[]
  ownership_marker: string
  schema_version: number
}

export interface ManagedOfficialSubagentRole {
  id: string
  filename: string
  aliases: string[]
  codex_name: string
  description: string
  model: string
  model_reasoning_effort: 'max'
  nickname_candidates: string[]
  developer_instructions: string
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

/**
 * Canonical Codex custom agents for the 6.1.1 official subagent workflow.
 * Legacy SKS role files remain in MANAGED_AGENT_ROLES for compatibility inventory,
 * but fresh setup only requires and generates these two roles.
 */
export const MANAGED_OFFICIAL_SUBAGENT_ROLES: readonly ManagedOfficialSubagentRole[] = Object.freeze([
  officialSubagentRole({
    id: 'sks-official-worker',
    filename: 'worker.toml',
    aliases: ['worker'],
    codexName: 'worker',
    description: 'Execution-focused subagent for clear, bounded, repeatable work with an explicit done condition.',
    model: 'gpt-5.6-luna',
    nicknames: ['Kite', 'Moss', 'Pico', 'Reed', 'Vale', 'Wren'],
    instructions: `You are a bounded execution subagent.

Work only on the exact slice assigned by the parent agent.
Do not redesign the task, expand scope, or spawn another subagent.
Prefer clear, mechanical, repeatable execution.
Respect the parent session's sandbox and approval mode.
When writing, touch only the assigned files or paths.
Run only the verification directly relevant to your slice.
Return:
1. concise result,
2. files inspected or changed,
3. verification performed,
4. blockers or uncertainty.
Do not claim success without direct evidence.`
  }),
  officialSubagentRole({
    id: 'sks-official-expert',
    filename: 'expert.toml',
    aliases: ['expert'],
    codexName: 'expert',
    description: 'Reasoning-focused subagent for UI, UX, review, debugging, planning, strategy, architecture, integration, and risk analysis.',
    model: 'gpt-5.6-sol',
    nicknames: ['Atlas', 'Delta', 'Helix', 'Orion', 'Sage', 'Vector'],
    instructions: `You are the reasoning and judgment subagent.

Use this agent for UI/UX, review, debugging, diagnosis, planning,
strategy, architecture, refactoring, integration, security, database,
release, ambiguity, and trade-off work.

Do not spawn another subagent.
Separate evidence from inference.
For reviews, lead with concrete findings and file references.
For debugging, reproduce or trace the failure before proposing a fix.
For planning, produce a bounded plan with clear ownership and stop conditions.
For implementation, make the smallest defensible change.
Run only verification that can change the decision.
Return a concise result, evidence, risks, and next action.`
  })
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

export function managedOfficialSubagentRoleByFile(filename: string): ManagedOfficialSubagentRole | null {
  const base = filename.split(/[\\/]/).pop() || filename
  assertUniqueManagedAgentRoleFilenames()
  return MANAGED_OFFICIAL_SUBAGENT_ROLES.find((role) => role.filename === base) || null
}

export function managedOfficialSubagentRoleByName(name: string): ManagedOfficialSubagentRole | null {
  const normalized = normalizeRoleName(name)
  return MANAGED_OFFICIAL_SUBAGENT_ROLES.find((role) => [
    role.id,
    role.codex_name,
    role.filename.replace(/\.toml$/i, ''),
    ...role.aliases
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
    `sandbox_mode = "${role.sandbox}"`,
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
    && text.includes('developer_instructions = """')
  return hasManagedMarker || legacyCompatible
}

export function managedOfficialSubagentRoleBody(role: ManagedOfficialSubagentRole): string {
  return [
    `name = "${role.codex_name}"`,
    `description = "${role.description}"`,
    `model = "${role.model}"`,
    `model_reasoning_effort = "${role.model_reasoning_effort}"`,
    '',
    'nickname_candidates = [',
    ...role.nickname_candidates.map((nickname) => `  "${nickname}",`),
    ']',
    '',
    'developer_instructions = """',
    role.developer_instructions,
    '"""',
    ''
  ].join('\n')
}

export function managedOfficialSubagentRoleContent(role: ManagedOfficialSubagentRole): string {
  const body = managedOfficialSubagentRoleBody(role)
  return [
    `# ${MANAGED_OFFICIAL_SUBAGENT_MARKER}`,
    `# sks_managed_schema = ${role.schema_version}`,
    `# sks_managed_id = "${role.id}"`,
    `# sks_managed_body_sha256 = "${sha256(body)}"`,
    '',
    body
  ].join('\n')
}

export function managedOfficialSubagentRoleOwnsText(text: string, role: ManagedOfficialSubagentRole): boolean {
  const source = String(text || '')
  if (!source.includes(`# ${MANAGED_OFFICIAL_SUBAGENT_MARKER}`)) return false
  if (!source.includes(`sks_managed_id = "${role.id}"`)) return false
  const lines = source.split('\n')
  const hashIndex = lines.findIndex((line) => /^#\s*sks_managed_body_sha256\s*=/.test(line.trim()))
  if (hashIndex === -1) return false
  const expectedHash = lines[hashIndex]?.match(/^#\s*sks_managed_body_sha256\s*=\s*"([a-f0-9]{64})"\s*$/i)?.[1]
  if (!expectedHash) return false
  const separatorIndex = lines.findIndex((line, index) => index > hashIndex && line.trim() === '')
  if (separatorIndex === -1) return false
  const body = lines.slice(separatorIndex + 1).join('\n')
  return sha256(body) === expectedHash
}

export function normalizeRoleName(name: string): string {
  return String(name || '').trim().replace(/\.toml$/i, '').replace(/_/g, '-').toLowerCase()
}

export function assertUniqueManagedAgentRoleFilenames(): void {
  const seen = new Map<string, string>()
  for (const role of [...MANAGED_AGENT_ROLES, ...MANAGED_OFFICIAL_SUBAGENT_ROLES]) {
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
    required_for: ['codex-native-runtime'],
    ownership_marker: MANAGED_ASSET_MARKER,
    schema_version: MANAGED_ASSET_SCHEMA_VERSION
  }
}

function officialSubagentRole(input: {
  id: string
  filename: string
  aliases: string[]
  codexName: string
  description: string
  model: string
  nicknames: string[]
  instructions: string
}): ManagedOfficialSubagentRole {
  return {
    id: input.id,
    filename: input.filename,
    aliases: input.aliases,
    codex_name: input.codexName,
    description: input.description,
    model: input.model,
    model_reasoning_effort: 'max',
    nickname_candidates: input.nicknames,
    developer_instructions: input.instructions,
    required_for: ['codex-official-subagent-workflow'],
    ownership_marker: MANAGED_OFFICIAL_SUBAGENT_MARKER,
    schema_version: MANAGED_ASSET_SCHEMA_VERSION
  }
}
