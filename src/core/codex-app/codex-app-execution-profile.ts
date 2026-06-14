// @ts-nocheck
import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { buildCodexAppHarnessMatrix } from './codex-app-harness-matrix.js'

export type CodexAppExecutionProfileMode = 'codex-app-native' | 'codex-cli-headless' | 'sks-loop-headless' | 'degraded-no-app'

export async function resolveCodexAppExecutionProfile(input: { root: string; matrix?: any } = { root: process.cwd() }): Promise<any> {
  const root = path.resolve(input.root || process.cwd())
  const matrix = input.matrix || await buildCodexAppHarnessMatrix({ root }).catch(() => null)
  const mode: CodexAppExecutionProfileMode = !matrix?.codex_cli?.available
    ? 'degraded-no-app'
    : matrix.app_features?.app_handoff_ready && matrix.app_features?.agent_type_supported
      ? 'codex-app-native'
      : matrix.codex_cli.available
        ? 'codex-cli-headless'
        : 'sks-loop-headless'
  const profile = {
    schema: 'sks.codex-app-execution-profile.v1',
    generated_at: nowIso(),
    ok: mode !== 'degraded-no-app',
    mode,
    agent_role_strategy: matrix?.app_features?.agent_type_supported ? 'agent_type' : 'message-role',
    hooks_assumed_running: false,
    hooks_approval_required: matrix?.app_features?.hook_approval_state_detectable !== true,
    app_handoff_ready: matrix?.app_features?.app_handoff_ready === true,
    image_path_exposure_ready: matrix?.app_features?.image_path_exposure_ready === true,
    loop_mesh_app_profile_available: true,
    blockers: mode === 'degraded-no-app' ? ['codex_cli_missing'] : [],
    warnings: matrix?.warnings || []
  }
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'codex-app-execution-profile.json'), profile).catch(() => undefined)
  return profile
}
