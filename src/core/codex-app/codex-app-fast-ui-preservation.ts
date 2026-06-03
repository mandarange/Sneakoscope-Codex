import path from 'node:path'
import { nowIso, readText, writeJsonAtomic } from '../fsx.js'
import {
  diffCodexAppUiSnapshots,
  scanProjectLocalForbiddenKeys,
  snapshotCodexAppUiState,
  type CodexAppUiStateSnapshot
} from './codex-app-ui-state-snapshot.js'

export const CODEX_APP_FAST_UI_PRESERVATION_SCHEMA = 'sks.codex-app-fast-ui-preservation.v1'

export interface CodexAppFastUiPreservationInput {
  before?: CodexAppUiStateSnapshot | null
  after?: CodexAppUiStateSnapshot | null
  codexHome?: string | null
  reportPath?: string | null
}

export async function evaluateCodexAppFastUiPreservation(root: string = process.cwd(), input: CodexAppFastUiPreservationInput = {}) {
  const snapshotInput = input.codexHome === undefined ? {} : { codexHome: input.codexHome }
  const before = input.before || await snapshotCodexAppUiState(root, snapshotInput)
  const after = input.after || await snapshotCodexAppUiState(root, snapshotInput)
  const diff = diffCodexAppUiSnapshots(before, after)
  const projectConfigText = await readText(path.join(root, '.codex', 'config.toml'), '')
  const projectForbiddenKeys = scanProjectLocalForbiddenKeys(projectConfigText)
  const blockers = [
    ...diff.blockers,
    ...projectForbiddenKeys.map((key) => `project_local_forbidden_codex_key:${key}`)
  ]
  return {
    schema: CODEX_APP_FAST_UI_PRESERVATION_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    before_fast_selector: before.indicators.fast_selector,
    after_fast_selector: after.indicators.fast_selector,
    host_owned_state_diff: diff,
    project_local_forbidden_keys: projectForbiddenKeys,
    snapshot_secret_leak_suspected: before.indicators.secret_leak_suspected || after.indicators.secret_leak_suspected,
    policy: {
      sks_mad_uses_task_or_sdk_config_override: true,
      codex_app_host_owned_state_is_read_only_by_default: true,
      project_local_provider_profile_auth_keys_forbidden: true
    },
    blockers
  }
}

export async function writeCodexAppFastUiPreservationReport(root: string = process.cwd(), input: CodexAppFastUiPreservationInput = {}) {
  const report = await evaluateCodexAppFastUiPreservation(root, input)
  const reportPath = input.reportPath || path.join(path.resolve(root), '.sneakoscope', 'reports', 'codex-app-fast-ui-preservation.json')
  await writeJsonAtomic(reportPath, report)
  return { ...report, report_path: reportPath }
}
