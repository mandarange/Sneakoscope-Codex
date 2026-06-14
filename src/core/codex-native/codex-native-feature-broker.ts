import path from 'node:path'
import { findCodexBinary } from '../codex-adapter.js'
import { codexAppIntegrationStatus } from '../codex-app.js'
import { syncCodexAgentRoles } from '../codex-app/codex-agent-role-sync.js'
import { probeCodexAgentTypeSupport } from '../codex-app/codex-agent-type-probe.js'
import { probeCodexHookApprovalState } from '../codex-app/codex-hook-approval-probe.js'
import { syncCodexSksSkills } from '../codex-app/codex-skill-sync.js'
import { detectCodex0138Capability } from '../codex-control/codex-0138-capability.js'
import { detectCodex0139Capability } from '../codex-control/codex-0139-capability.js'
import { buildCodexPluginInventory } from '../codex-plugins/codex-plugin-json.js'
import { nowIso, runProcess, writeJsonAtomic } from '../fsx.js'
import { buildMcpPluginServerCandidates } from '../mcp/mcp-plugin-inventory.js'
import { codexNativeFeatureState, computeCodexNativeInvocationDefaults, type CodexNativeFeatureMatrix, type CodexNativeFeatureState } from './codex-native-feature-matrix.js'

const REPORT_PATH = '.sneakoscope/reports/codex-native-feature-matrix.json'

export async function buildCodexNativeFeatureMatrix(input: {
  root: string
  missionDir?: string | null
  applyRepairs?: boolean
} = { root: process.cwd() }): Promise<CodexNativeFeatureMatrix> {
  const root = path.resolve(input.root || process.cwd())
  const fixtureMode = process.env.SKS_CODEX_0138_FAKE === '1' || process.env.SKS_CODEX_0139_FAKE === '1' || process.env.SKS_CODEX_PLUGIN_JSON_FAKE === '1'
  const codexBin = fixtureMode ? process.env.CODEX_BIN || 'codex' : await findCodexBinary().catch(() => null)
  const version = codexBin ? await codexVersion(codexBin) : null
  const cap0138 = await detectCodex0138Capability({ codexBin }).catch((err: unknown) => ({ blockers: [messageOf(err)] }))
  const cap0139 = await detectCodex0139Capability({ codexBin }).catch((err: unknown) => ({ blockers: [messageOf(err)] }))
  const app = await codexAppIntegrationStatus({ codex: { bin: codexBin, version, available: Boolean(codexBin) } }).catch((err: unknown) => ({ ok: false, blockers: [messageOf(err)] }))
  const plugins = await buildCodexPluginInventory().catch((err: unknown) => ({
    schema: 'sks.codex-plugin-inventory.v1' as const,
    generated_at: nowIso(),
    codex_0138_capability: null,
    fetch_concurrency: 0,
    detail_fetch_count: 0,
    detail_fetch_failed_count: 0,
    duration_ms: 0,
    plugins: [],
    marketplace_available: false,
    blockers: [messageOf(err)]
  }))
  const mcpCandidates = buildMcpPluginServerCandidates(plugins)
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'codex-plugin-inventory.json'), plugins).catch(() => undefined)
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'mcp-plugin-server-candidates.json'), mcpCandidates).catch(() => undefined)
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
  const skillSync = await syncCodexSksSkills({ root, apply: input.applyRepairs === true }).catch((err: unknown) => ({ ok: false, blockers: [messageOf(err)] }))
  const agentRoles = await syncCodexAgentRoles({ root, apply: input.applyRepairs === true }).catch((err: unknown) => ({ ok: false, blockers: [messageOf(err)] }))
  const appRecord: Record<string, unknown> = isRecord(app) ? app : {}
  const requiredSkills = isRecord(appRecord.required_skills) ? appRecord.required_skills : {}
  const skills = isRecord(appRecord.skills) ? appRecord.skills : {}
  const skillShadows = isRecord(appRecord.skill_shadows) ? appRecord.skill_shadows : {}
  const skillPickerReady = requiredSkills.ok === true || skills.ok === true || skillShadows.ok !== false
  const hookApproved = hookApproval.approval_state === 'approved'
  const hookInstalled = hookApproval.approval_state !== 'not_installed'
  const features: CodexNativeFeatureMatrix['features'] = {
    plugin_json: boolState(booleanFeature(cap0138, 'supports_plugin_json'), 'actual-probe', '.sneakoscope/codex-0138-capability.json', blockersOf(cap0138)),
    plugin_marketplace: boolState(booleanFeature(cap0139, 'supports_marketplace_source_field') || plugins.marketplace_available, 'plugin-inventory', '.sneakoscope/codex-plugin-inventory.json', blockersOf(plugins)),
    hook_approval: codexNativeFeatureState({
      ok: hookApproved,
      source: 'actual-probe',
      artifact_path: '.sneakoscope/reports/codex-hook-approval-probe.json',
      evidence: [`approval_state:${hookApproval.approval_state}`],
      blockers: hookApproval.approval_state === 'modified_requires_reapproval' ? ['hook_modified_requires_reapproval'] : [],
      warnings: [...hookApproval.warnings, ...(!hookApproved && hookInstalled ? ['hook_derived_evidence_not_counted'] : [])],
      unavailableStatus: hookInstalled ? 'unknown' : 'unavailable'
    }),
    skill_picker: boolState(skillPickerReady, 'config', '.sneakoscope/reports/codex-native-feature-matrix.json', [], skillPickerReady ? [] : ['skill_picker_unverified']),
    skill_sync: boolState(recordOk(skillSync) !== false, 'actual-probe', '.sneakoscope/reports/codex-skill-sync.json', blockersOf(skillSync)),
    agent_roles: boolState(recordOk(agentRoles) !== false, 'actual-probe', '.sneakoscope/reports/codex-agent-role-sync.json', blockersOf(agentRoles)),
    agent_type: codexNativeFeatureState({
      ok: agentType.supported === true,
      source: agentType.source === 'fixture' ? 'fixture' : 'actual-probe',
      artifact_path: '.sneakoscope/reports/codex-agent-type-probe.json',
      evidence: agentType.evidence,
      blockers: [],
      warnings: [...agentType.warnings, ...(agentType.supported ? [] : ['agent_type_unavailable_message_role_fallback'])],
      unavailableStatus: 'fallback'
    }),
    mcp_inventory: codexNativeFeatureState({
      ok: mcpCandidates.candidates.length > 0 || Array.isArray(plugins.plugins),
      source: 'plugin-inventory',
      artifact_path: '.sneakoscope/mcp-plugin-server-candidates.json',
      evidence: [`candidate_count:${mcpCandidates.candidates.length}`],
      blockers: [...plugins.blockers, ...mcpCandidates.blockers],
      warnings: mcpCandidates.candidates.length ? [] : ['mcp_plugin_candidates_empty'],
      unavailableStatus: 'fallback'
    }),
    app_handoff: boolState(booleanFeature(cap0138, 'supports_app_handoff'), 'actual-probe', '.sneakoscope/codex-0138-capability.json', blockersOf(cap0138)),
    image_path_exposure: boolState(booleanFeature(cap0138, 'supports_image_path_exposure'), 'actual-probe', '.sneakoscope/codex-0138-capability.json', blockersOf(cap0138)),
    code_mode_web_search: boolState(booleanFeature(cap0139, 'supports_code_mode_web_search'), 'actual-probe', '.sneakoscope/codex-0139-capability.json', blockersOf(cap0139)),
    slash_command_bridge: boolState(true, 'config', '.sneakoscope/reports/codex-native-feature-matrix.json'),
    project_memory: boolState(true, 'config', '.sneakoscope/context/AGENTS.generated.md')
  }
  const matrixBase = {
    schema: 'sks.codex-native-feature-matrix.v1' as const,
    generated_at: nowIso(),
    ok: false,
    codex_cli: { available: Boolean(codexBin), version, bin: codexBin },
    features,
    probes: {
      codex_0138: cap0138,
      codex_0139: cap0139,
      app,
      plugin_inventory: plugins,
      mcp_candidates: mcpCandidates,
      hook_approval: hookApproval,
      agent_type: agentType,
      skill_sync: skillSync,
      agent_roles: agentRoles
    },
    invocation_defaults: {
      loop_worker_role_strategy: 'message-role' as const,
      qa_visual_review_strategy: 'headless-artifact' as const,
      research_source_strategy: 'local-files' as const,
      image_followup_strategy: 'artifact-path' as const,
      hook_evidence_policy: 'unknown-do-not-count' as const,
      skill_bridge_strategy: 'cli-only' as const
    },
    blockers: [
      ...(!codexBin ? ['codex_cli_missing'] : []),
      ...Object.values(features).flatMap((feature) => feature.blockers)
    ],
    warnings: Object.values(features).flatMap((feature) => feature.warnings)
  }
  const matrix: CodexNativeFeatureMatrix = {
    ...matrixBase,
    ok: matrixBase.blockers.length === 0,
    invocation_defaults: computeCodexNativeInvocationDefaults(matrixBase)
  }
  await writeCodexNativeFeatureMatrix(root, matrix, input.missionDir)
  return matrix
}

export async function writeCodexNativeFeatureMatrix(root: string, matrix: CodexNativeFeatureMatrix, missionDir?: string | null): Promise<void> {
  await writeJsonAtomic(path.join(root, REPORT_PATH), matrix)
  if (missionDir) await writeJsonAtomic(path.join(missionDir, 'codex-native-feature-matrix.json'), matrix).catch(() => undefined)
}

function boolState(ok: boolean, source: CodexNativeFeatureState['source'], artifactPath: string, blockers: string[] = [], warnings: string[] = []): CodexNativeFeatureState {
  return codexNativeFeatureState({
    ok,
    source,
    artifact_path: artifactPath,
    blockers: ok ? [] : blockers,
    warnings: ok ? warnings : [...warnings, ...(!blockers.length ? ['feature_unavailable'] : [])]
  })
}

async function codexVersion(bin: string): Promise<string | null> {
  const run = await runProcess(bin, ['--version'], { timeoutMs: 5000, maxOutputBytes: 16 * 1024 }).catch(() => null)
  return run?.code === 0 ? `${run.stdout || run.stderr || ''}`.trim() || null : null
}

function booleanFeature(value: unknown, key: string): boolean {
  return isRecord(value) && value[key] === true
}

function blockersOf(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.blockers)) return []
  return value.blockers.map((item) => String(item)).filter(Boolean)
}

function recordOk(value: unknown): boolean | undefined {
  return isRecord(value) && typeof value.ok === 'boolean' ? value.ok : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
