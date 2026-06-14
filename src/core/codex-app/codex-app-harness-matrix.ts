// @ts-nocheck
import path from 'node:path'
import { findCodexBinary } from '../codex-adapter.js'
import { codexAppIntegrationStatus } from '../codex-app.js'
import { detectCodex0138Capability } from '../codex-control/codex-0138-capability.js'
import { detectCodex0139Capability } from '../codex-control/codex-0139-capability.js'
import { buildCodexPluginInventory } from '../codex-plugins/codex-plugin-json.js'
import { readCodexHookActualState } from '../codex-hooks/codex-hook-actual-discovery.js'
import { nowIso, runProcess, writeJsonAtomic } from '../fsx.js'
import { repairAgentRoleConfigs } from '../agents/agent-role-config.js'
import { buildLazyCodexInteropPolicy } from './lazycodex-interop-policy.js'

export interface CodexAppHarnessMatrix {
  schema: 'sks.codex-app-harness-matrix.v1'
  generated_at: string
  ok: boolean
  codex_cli: { available: boolean; version: string | null }
  app_features: {
    plugin_json: boolean
    marketplace_add: boolean
    marketplace_upgrade: boolean
    startup_review_detectable: boolean
    hook_approval_state_detectable: boolean
    skill_picker_ready: boolean
    agent_type_supported: boolean
    mcp_inventory_ready: boolean
    app_handoff_ready: boolean
    image_path_exposure_ready: boolean
  }
  sks_integrations: {
    dollar_skills_synced: boolean
    agent_roles_synced: boolean
    hooks_synced: boolean
    init_deep_available: boolean
    loop_mesh_app_profile_available: boolean
  }
  blockers: string[]
  warnings: string[]
}

export async function buildCodexAppHarnessMatrix(input: { root: string; missionDir?: string | null; applyRepairs?: boolean } = { root: process.cwd() }): Promise<CodexAppHarnessMatrix> {
  const root = path.resolve(input.root || process.cwd())
  const codexBin = await findCodexBinary().catch(() => null)
  const version = codexBin ? await codexVersion(codexBin) : null
  const cap0138 = await detectCodex0138Capability({ codexBin }).catch((err: any) => ({ blockers: [err?.message || String(err)] }))
  const cap0139 = await detectCodex0139Capability({ codexBin }).catch((err: any) => ({ blockers: [err?.message || String(err)] }))
  const app = await codexAppIntegrationStatus({ codex: { bin: codexBin, version, available: Boolean(codexBin) } }).catch((err: any) => ({ ok: false, blockers: [err?.message || String(err)] }))
  const plugins = await buildCodexPluginInventory().catch((err: any) => ({ plugins: [], marketplace_available: false, blockers: [err?.message || String(err)] }))
  const hooks = await readCodexHookActualState(root).catch((err: any) => ({ ok: false, entries: [], blockers: [err?.message || String(err)] }))
  const agents = await repairAgentRoleConfigs({ root, apply: input.applyRepairs === true, reportPath: path.join(root, '.sneakoscope', 'reports', 'codex-agent-role-sync.json') }).catch((err: any) => ({ ok: false, blockers: [err?.message || String(err)] }))
  const interop = await buildLazyCodexInteropPolicy({ root, inventory: plugins }).catch(() => null)
  const hasSkills = app?.required_skills?.ok === true || app?.skills?.ok === true || app?.skill_shadows?.ok !== false
  const hookApprovalKnown = false
  const matrix: CodexAppHarnessMatrix = {
    schema: 'sks.codex-app-harness-matrix.v1',
    generated_at: nowIso(),
    ok: Boolean(codexBin) && (cap0138 as any).supports_plugin_json !== false && agents.ok !== false,
    codex_cli: { available: Boolean(codexBin), version },
    app_features: {
      plugin_json: (cap0138 as any).supports_plugin_json === true,
      marketplace_add: (cap0139 as any).supports_marketplace_source_field === true || (plugins as any).marketplace_available === true,
      marketplace_upgrade: (cap0139 as any).supports_marketplace_source_field === true,
      startup_review_detectable: hookApprovalKnown,
      hook_approval_state_detectable: hookApprovalKnown,
      skill_picker_ready: Boolean(hasSkills),
      agent_type_supported: process.env.SKS_CODEX_AGENT_TYPE_SUPPORTED === '1',
      mcp_inventory_ready: Array.isArray((plugins as any).plugins),
      app_handoff_ready: (cap0138 as any).supports_app_handoff === true,
      image_path_exposure_ready: (cap0138 as any).supports_image_path_exposure === true
    },
    sks_integrations: {
      dollar_skills_synced: Boolean(hasSkills),
      agent_roles_synced: agents.ok !== false,
      hooks_synced: hooks.ok !== false && (hooks.entries || []).length > 0,
      init_deep_available: true,
      loop_mesh_app_profile_available: true
    },
    blockers: [
      ...(!codexBin ? ['codex_cli_missing'] : []),
      ...((cap0138 as any).blockers || []),
      ...((plugins as any).blockers || []),
      ...((agents as any).blockers || [])
    ],
    warnings: [
      ...((cap0139 as any).blockers || []).map((b: string) => `codex_0139:${b}`),
      ...((hooks as any).blockers || []).map((b: string) => `hooks:${b}`),
      ...(!hookApprovalKnown ? ['hook_approval_state_unknown'] : []),
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
