import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { buildCodexAppHarnessMatrix } from './codex-app-harness-matrix.js'
import { isCodexAppHarnessMatrix, type CodexAppExecutionProfile, type CodexAppExecutionProfileMode, type CodexAppHarnessMatrix } from './codex-app-types.js'
import { buildCodexNativeFeatureMatrix } from '../codex-native/codex-native-feature-broker.js'
import type { CodexNativeFeatureMatrix } from '../codex-native/codex-native-feature-matrix.js'

export async function resolveCodexAppExecutionProfile(input: { root: string; matrix?: CodexAppHarnessMatrix | unknown } = { root: process.cwd() }): Promise<CodexAppExecutionProfile> {
  const root = path.resolve(input.root || process.cwd())
  const nativeMatrix = await buildCodexNativeFeatureMatrix({ root }).catch(() => null)
  const maybeMatrix = input.matrix || (nativeMatrix ? null : await buildCodexAppHarnessMatrix({ root }).catch(() => null))
  const matrix = isCodexAppHarnessMatrix(maybeMatrix) ? maybeMatrix : null
  const mode: CodexAppExecutionProfileMode = nativeMatrix
    ? modeFromNative(nativeMatrix)
    : !matrix?.codex_cli.available
    ? 'degraded-no-app'
    : matrix.app_features.app_handoff_ready && matrix.app_features.agent_type_supported
      ? 'codex-app-native'
      : matrix.codex_cli.available
        ? 'codex-cli-headless'
        : 'sks-loop-headless'
  const agentRoleStrategy = nativeMatrix?.invocation_defaults.loop_worker_role_strategy || (matrix?.app_features.agent_type_supported ? 'agent_type' : 'message-role')
  const hookApprovalState = hookApprovalStateFrom(nativeMatrix) || matrix?.app_features.hook_approval_state || 'unknown'
  const profile: CodexAppExecutionProfile = {
    schema: 'sks.codex-app-execution-profile.v1',
    generated_at: nowIso(),
    ok: mode !== 'degraded-no-app',
    mode,
    agent_role_strategy: agentRoleStrategy,
    hooks_assumed_running: false,
    hooks_approval_required: hookApprovalState !== 'approved',
    hook_approval_state: hookApprovalState,
    app_handoff_ready: nativeMatrix?.features.app_handoff.ok === true || matrix?.app_features.app_handoff_ready === true,
    image_path_exposure_ready: nativeMatrix?.features.image_path_exposure.ok === true || matrix?.app_features.image_path_exposure_ready === true,
    plugin_mcp_inventory_ready: nativeMatrix?.features.mcp_inventory.ok === true || matrix?.app_features.mcp_inventory_ready === true,
    loop_mesh_app_profile_available: true,
    artifact_path: '.sneakoscope/reports/codex-app-execution-profile.json',
    matrix_artifact_path: nativeMatrix ? '.sneakoscope/reports/codex-native-feature-matrix.json' : '.sneakoscope/reports/codex-app-harness-matrix.json',
    agent_type_probe_artifact_path: '.sneakoscope/reports/codex-agent-type-probe.json',
    hook_approval_probe_artifact_path: '.sneakoscope/reports/codex-hook-approval-probe.json',
    blockers: mode === 'degraded-no-app' ? ['codex_cli_missing'] : [],
    warnings: nativeMatrix?.warnings || matrix?.warnings || []
  }
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'codex-app-execution-profile.json'), profile).catch(() => undefined)
  return profile
}

function modeFromNative(matrix: CodexNativeFeatureMatrix): CodexAppExecutionProfileMode {
  if (!matrix.codex_cli.available) return 'degraded-no-app'
  if (matrix.features.app_handoff.ok && matrix.features.agent_type.ok) return 'codex-app-native'
  return 'codex-cli-headless'
}

function hookApprovalStateFrom(matrix: CodexNativeFeatureMatrix | null): CodexAppExecutionProfile['hook_approval_state'] | null {
  const probe = matrix?.probes.hook_approval
  if (!probe || typeof probe !== 'object' || Array.isArray(probe)) return null
  const state = (probe as { approval_state?: unknown }).approval_state
  return state === 'approved' || state === 'pending_review' || state === 'modified_requires_reapproval' || state === 'not_installed' || state === 'unknown'
    ? state
    : null
}
