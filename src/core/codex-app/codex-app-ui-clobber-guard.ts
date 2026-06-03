import path from 'node:path'
import { nowIso, readText, writeJsonAtomic } from '../fsx.js'
import { PROJECT_LOCAL_FORBIDDEN_CODEX_KEYS, scanProjectLocalForbiddenKeys } from './codex-app-ui-state-snapshot.js'

export const CODEX_APP_UI_CLOBBER_GUARD_SCHEMA = 'sks.codex-app-ui-clobber-guard.v1'

export type CodexAppUiMutationKind = 'codex_app_ui_state'
export type CodexAppUiRepairScope = 'default' | 'codex-app-ui-repair'

const MUTATION_WORD_RE = /\b(?:writeFile|appendFile|rename|rm|unlink|copyFile|mkdir|normalizeCodexFastModeUiConfig|ensureGlobalCodexFastModeDuringInstall)\b/
const CODEX_APP_PRIVATE_STATE_RE = /(?:Library\/Application Support\/com\.openai\.codex|CODEX_HOME|~\/\.codex|\.codex\/config\.toml)/

export function codexAppUiMutationAllowed(input: { kind?: CodexAppUiMutationKind; scope?: CodexAppUiRepairScope | string | null; backupPath?: string | null } = {}) {
  if (input.kind !== 'codex_app_ui_state') return true
  return input.scope === 'codex-app-ui-repair' && Boolean(input.backupPath)
}

export function assertCodexAppUiMutationAllowed(input: { kind: CodexAppUiMutationKind; scope?: CodexAppUiRepairScope | string | null; backupPath?: string | null }) {
  if (!codexAppUiMutationAllowed(input)) {
    throw new Error('codex_app_ui_state mutation requires explicit repair scope and backup')
  }
}

export async function evaluateCodexAppUiClobberGuard(root: string = process.cwd(), input: { reportPath?: string | null } = {}) {
  const projectConfigText = await readText(path.join(root, '.codex', 'config.toml'), '')
  const packageJson = await readText(path.join(root, 'package.json'), '')
  const postinstallCommand = extractPackageScript(packageJson, 'postinstall')
  const projectForbiddenKeys = scanProjectLocalForbiddenKeys(projectConfigText)
  const postinstallTouchesPrivateState = Boolean(postinstallCommand && CODEX_APP_PRIVATE_STATE_RE.test(postinstallCommand) && MUTATION_WORD_RE.test(postinstallCommand))
  const blockers = [
    ...projectForbiddenKeys.map((key) => `project_local_forbidden_codex_key:${key}`),
    ...(postinstallTouchesPrivateState ? ['postinstall_codex_app_ui_state_write_detected'] : [])
  ]
  const report = {
    schema: CODEX_APP_UI_CLOBBER_GUARD_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    mutation_kind: 'codex_app_ui_state',
    default_requested_scope_allows_mutation: false,
    repair_scope_requires_backup: true,
    forbidden_project_local_keys: [...PROJECT_LOCAL_FORBIDDEN_CODEX_KEYS],
    project_local_forbidden_keys_present: projectForbiddenKeys,
    postinstall_command: postinstallCommand,
    postinstall_touches_private_state: postinstallTouchesPrivateState,
    blockers
  }
  if (input.reportPath) await writeJsonAtomic(input.reportPath, report)
  return report
}

function extractPackageScript(packageJsonText: string, name: string) {
  try {
    const parsed = JSON.parse(packageJsonText)
    return typeof parsed?.scripts?.[name] === 'string' ? parsed.scripts[name] : null
  } catch {
    return null
  }
}
