import path from 'node:path'
import { findCodexBinary } from '../codex-adapter.js'
import { codexAppIntegrationStatus } from '../codex-app.js'
import { detectCodex0138Capability } from '../codex-control/codex-0138-capability.js'
import { detectCodex0139Capability } from '../codex-control/codex-0139-capability.js'
import { buildCodexPluginInventory } from '../codex-plugins/codex-plugin-json.js'
import { nowIso, runProcess, writeJsonAtomic } from '../fsx.js'
import { repairAgentRoleConfigs } from '../agents/agent-role-config.js'
import { buildLazyCodexInteropPolicy } from './lazycodex-interop-policy.js'
import { probeCodexAgentTypeSupport } from './codex-agent-type-probe.js'
import { probeCodexHookApprovalState } from './codex-hook-approval-probe.js'
import { isRecord, type CodexAppHarnessMatrix } from './codex-app-types.js'

export async function buildCodexAppHarnessMatrix(input: { root: string; missionDir?: string | null; applyRepairs?: boolean } = { root: process.cwd() }): Promise<CodexAppHarnessMatrix> {
  const root = path.resolve(input.root || process.cwd())
  const codexBin = await findCodexBinary().catch(() => null)
  const version = codexBin ? await codexVersion(codexBin) : null
  const cap0138 = await detectCodex0138Capability({ codexBin }).catch((err: unknown) => ({ blockers: [messageOf(err)] }))
  const cap0139 = await detectCodex0139Capability({ codexBin }).catch((err: unknown) => ({ blockers: [messageOf(err)] }))
  const app = await codexAppIntegrationStatus({ codex: { bin: codexBin, version, available: Boolean(codexBin) } }).catch((err: unknown) => ({ ok: false, blockers: [messageOf(err)] }))
  const plugins = await buildCodexPluginInventory().catch((err: unknown) => ({ plugins: [], marketplace_available: false, blockers: [messageOf(err)] }))
  const hookApproval = await probeCodexHookApprovalState(root, { codexBin }).catch((err: unknown) => ({
    schema: 'sks.codex-hook-approval-probe.v1' as const,
    generated_at: nowIso(),
    ok: false,
    detectable: false,
    approval_state: 'unknown' as const,
    sources_checked: [],
    blockers: [messageOf(err)],
    warnings: ['hook_approval_probe_failed']
  }))
  const agentType = await probeCodexAgentTypeSupport(root, { codexBin }).catch((err: unknown) => ({
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
  const agents = await repairAgentRoleConfigs({ root, apply: input.applyRepairs === true, reportPath: path.join(root, '.sneakoscope', 'reports', 'codex-agent-role-sync.json') }).catch((err: unknown) => ({ ok: false, blockers: [messageOf(err)] }))
  const interop = await buildLazyCodexInteropPolicy({ root, inventory: plugins }).catch(() => null)
  const appRecord: Record<string, unknown> = isRecord(app) ? app : {}
  const requiredSkills = isRecord(appRecord.required_skills) ? appRecord.required_skills : {}
  const skills = isRecord(appRecord.skills) ? appRecord.skills : {}
  const skillShadows = isRecord(appRecord.skill_shadows) ? appRecord.skill_shadows : {}
  const hasSkills = requiredSkills.ok === true || skills.ok === true || skillShadows.ok !== false
  const hookApprovalKnown = hookApproval.detectable === true
  const hookBlockers = hookApproval.approval_state === 'modified_requires_reapproval'
    ? ['hook_modified_requires_reapproval']
    : []
  const matrix: CodexAppHarnessMatrix = {
    schema: 'sks.codex-app-harness-matrix.v1',
    generated_at: nowIso(),
    ok: Boolean(codexBin) && feature(cap0138, 'supports_plugin_json') !== false && recordOk(agents) !== false,
    codex_cli: { available: Boolean(codexBin), version },
    app_features: {
      plugin_json: feature(cap0138, 'supports_plugin_json') === true,
      marketplace_add: feature(cap0139, 'supports_marketplace_source_field') === true || feature(plugins, 'marketplace_available') === true,
      marketplace_upgrade: feature(cap0139, 'supports_marketplace_source_field') === true,
      startup_review_detectable: hookApprovalKnown,
      hook_approval_state_detectable: hookApprovalKnown,
      hook_approval_state: hookApproval.approval_state,
      skill_picker_ready: Boolean(hasSkills),
      agent_type_supported: agentType.supported,
      mcp_inventory_ready: Array.isArray(isRecord(plugins) ? plugins.plugins : null),
      app_handoff_ready: feature(cap0138, 'supports_app_handoff') === true,
      image_path_exposure_ready: feature(cap0138, 'supports_image_path_exposure') === true
    },
    sks_integrations: {
      dollar_skills_synced: Boolean(hasSkills),
      agent_roles_synced: recordOk(agents) !== false,
      hooks_synced: hookApproval.approval_state === 'approved',
      init_deep_available: true,
      loop_mesh_app_profile_available: true
    },
    probes: {
      hook_approval: hookApproval,
      agent_type: agentType
    },
    blockers: [
      ...(!codexBin ? ['codex_cli_missing'] : []),
      ...blockersOf(cap0138),
      ...blockersOf(plugins),
      ...blockersOf(agents),
      ...hookBlockers
    ],
    warnings: [
      ...blockersOf(cap0139).map((b) => `codex_0139:${b}`),
      ...hookApproval.blockers.map((b) => `hooks:${b}`),
      ...hookApproval.warnings,
      ...agentType.warnings,
      ...(hookApproval.approval_state === 'pending_review' ? ['hook_approval_pending_review'] : []),
      ...(hookApproval.approval_state === 'not_installed' ? ['hooks_not_installed'] : []),
      ...(interop?.lazycodex_detected ? ['lazycodex_detected_coexist_mode'] : [])
    ]
  }
  matrix.ok = matrix.blockers.length === 0
  await writeCodexAppHarnessMatrix(root, matrix, input.missionDir)
  return matrix
}

export async function writeCodexAppHarnessMatrix(root: string, matrix: CodexAppHarnessMatrix, missionDir?: string | null) {
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'codex-app-harness-matrix.json'), matrix)
  if (missionDir) await writeJsonAtomic(path.join(missionDir, 'codex-app-harness-matrix.json'), matrix).catch(() => undefined)
}

async function codexVersion(bin: string): Promise<string | null> {
  const run = await runProcess(bin, ['--version'], { timeoutMs: 5000, maxOutputBytes: 16 * 1024 }).catch(() => null)
  return run?.code === 0 ? `${run.stdout || run.stderr || ''}`.trim() || null : null
}

function blockersOf(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.blockers)) return []
  return value.blockers.map((item) => String(item)).filter(Boolean)
}

function feature(value: unknown, key: string): boolean | undefined {
  return isRecord(value) && typeof value[key] === 'boolean' ? value[key] : undefined
}

function recordOk(value: unknown): boolean | undefined {
  return isRecord(value) && typeof value.ok === 'boolean' ? value.ok : undefined
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
