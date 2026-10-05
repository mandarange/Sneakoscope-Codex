export type CodexAppUiMutationKind = 'codex_app_ui_state'
export type CodexAppUiRepairScope = 'default' | 'codex-app-ui-repair'

export function codexAppUiMutationAllowed(input: { kind?: CodexAppUiMutationKind; scope?: CodexAppUiRepairScope | string | null; backupPath?: string | null } = {}) {
  if (input.kind !== 'codex_app_ui_state') return true
  return input.scope === 'codex-app-ui-repair' && Boolean(input.backupPath)
}

export function assertCodexAppUiMutationAllowed(input: { kind: CodexAppUiMutationKind; scope?: CodexAppUiRepairScope | string | null; backupPath?: string | null }) {
  if (!codexAppUiMutationAllowed(input)) {
    throw new Error('codex_app_ui_state mutation requires explicit repair scope and backup')
  }
}

