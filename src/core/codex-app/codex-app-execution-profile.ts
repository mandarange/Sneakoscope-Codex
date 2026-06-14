import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { buildCodexAppHarnessMatrix } from './codex-app-harness-matrix.js'
import { isCodexAppHarnessMatrix, type CodexAppExecutionProfile, type CodexAppExecutionProfileMode, type CodexAppHarnessMatrix } from './codex-app-types.js'

export async function resolveCodexAppExecutionProfile(input: { root: string; matrix?: CodexAppHarnessMatrix | unknown } = { root: process.cwd() }): Promise<CodexAppExecutionProfile> {
  const root = path.resolve(input.root || process.cwd())
  const maybeMatrix = input.matrix || await buildCodexAppHarnessMatrix({ root }).catch(() => null)
  const matrix = isCodexAppHarnessMatrix(maybeMatrix) ? maybeMatrix : null
  const mode: CodexAppExecutionProfileMode = !matrix?.codex_cli.available
    ? 'degraded-no-app'
    : matrix.app_features.app_handoff_ready && matrix.app_features.agent_type_supported
      ? 'codex-app-native'
      : matrix.codex_cli.available
        ? 'codex-cli-headless'
        : 'sks-loop-headless'
  const profile: CodexAppExecutionProfile = {
    schema: 'sks.codex-app-execution-profile.v1',
    generated_at: nowIso(),
    ok: mode !== 'degraded-no-app',
    mode,
    agent_role_strategy: matrix?.app_features.agent_type_supported ? 'agent_type' : 'message-role',
    hooks_assumed_running: false,
    hooks_approval_required: matrix?.app_features.hook_approval_state !== 'approved',
    hook_approval_state: matrix?.app_features.hook_approval_state || 'unknown',
    app_handoff_ready: matrix?.app_features.app_handoff_ready === true,
    image_path_exposure_ready: matrix?.app_features.image_path_exposure_ready === true,
    plugin_mcp_inventory_ready: matrix?.app_features.mcp_inventory_ready === true,
    loop_mesh_app_profile_available: true,
    artifact_path: '.sneakoscope/reports/codex-app-execution-profile.json',
    matrix_artifact_path: '.sneakoscope/reports/codex-app-harness-matrix.json',
    agent_type_probe_artifact_path: '.sneakoscope/reports/codex-agent-type-probe.json',
    hook_approval_probe_artifact_path: '.sneakoscope/reports/codex-hook-approval-probe.json',
    blockers: mode === 'degraded-no-app' ? ['codex_cli_missing'] : [],
    warnings: matrix?.warnings || []
  }
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'codex-app-execution-profile.json'), profile).catch(() => undefined)
  return profile
}
