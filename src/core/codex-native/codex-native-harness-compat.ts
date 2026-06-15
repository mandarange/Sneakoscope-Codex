import type { CodexAppHarnessMatrix } from '../codex-app/codex-app-types.js'
import { buildCodexNativeFeatureMatrix } from './codex-native-feature-broker.js'
import type { CodexNativeFeatureMatrix } from './codex-native-feature-matrix.js'

export async function buildCodexAppHarnessMatrixFromNative(input: {
  root: string
  missionDir?: string | null
  applyRepairs?: boolean
  repairManagedAssets?: boolean
  mode?: 'read-only' | 'repair'
}): Promise<CodexAppHarnessMatrix> {
  const matrix = await buildCodexNativeFeatureMatrix(input)
  return codexAppHarnessMatrixFromNative(matrix)
}

export function codexAppHarnessMatrixFromNative(matrix: CodexNativeFeatureMatrix): CodexAppHarnessMatrix {
  const hookApproval = probeRecord(matrix.probes.hook_approval)
  const agentType = probeRecord(matrix.probes.agent_type)
  const hookState = typeof hookApproval.approval_state === 'string' ? hookApproval.approval_state : 'unknown'
  return {
    schema: 'sks.codex-app-harness-matrix.v1',
    generated_at: matrix.generated_at,
    ok: matrix.ok,
    codex_cli: {
      available: matrix.codex_cli.available,
      version: matrix.codex_cli.version
    },
    app_features: {
      plugin_json: matrix.features.plugin_json.ok,
      marketplace_add: matrix.features.plugin_marketplace.ok,
      marketplace_upgrade: matrix.features.plugin_marketplace.ok,
      startup_review_detectable: hookState !== 'unknown',
      hook_approval_state_detectable: hookState !== 'unknown',
      hook_approval_state: hookState === 'approved'
        || hookState === 'pending_review'
        || hookState === 'modified_requires_reapproval'
        || hookState === 'not_installed'
        ? hookState
        : 'unknown',
      skill_picker_ready: matrix.features.skill_picker.ok,
      agent_type_supported: matrix.features.agent_type.ok,
      mcp_inventory_ready: matrix.features.mcp_inventory.ok,
      app_handoff_ready: matrix.features.app_handoff.ok,
      image_path_exposure_ready: matrix.features.image_path_exposure.ok
    },
    sks_integrations: {
      dollar_skills_synced: matrix.features.skill_sync.ok,
      agent_roles_synced: matrix.features.agent_roles.ok,
      hooks_synced: hookState === 'approved',
      init_deep_available: matrix.features.project_memory.ok,
      loop_mesh_app_profile_available: true
    },
    probes: {
      hook_approval: hookApproval as unknown as CodexAppHarnessMatrix['probes']['hook_approval'],
      agent_type: agentType as unknown as CodexAppHarnessMatrix['probes']['agent_type']
    },
    blockers: matrix.blockers,
    warnings: matrix.warnings
  }
}

function probeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
