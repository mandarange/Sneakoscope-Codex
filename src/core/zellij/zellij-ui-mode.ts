export type SksZellijUiMode =
  | 'compact-slots'
  | 'dashboard-plus-slots'
  | 'full-debug'

export function resolveZellijUiMode(args: string[] = [], env: NodeJS.ProcessEnv = process.env): SksZellijUiMode {
  return resolveExplicitZellijUiMode(args, env) || 'compact-slots'
}

export function resolveZellijWorkerPaneUiMode(args: string[] = [], env: NodeJS.ProcessEnv = process.env): SksZellijUiMode {
  return resolveExplicitZellijUiMode(args, env) || 'full-debug'
}

function resolveExplicitZellijUiMode(args: string[] = [], env: NodeJS.ProcessEnv = process.env): SksZellijUiMode | null {
  const fromEnv = String(env.SKS_ZELLIJ_UI_MODE || '').trim()
  if (fromEnv === 'compact-slots') return 'compact-slots'
  if (fromEnv === 'full-debug') return 'full-debug'
  if (fromEnv === 'dashboard-plus-slots') return 'dashboard-plus-slots'
  if (args.includes('--zellij-compact-slots')) return 'compact-slots'
  if (args.includes('--zellij-dashboard')) return 'dashboard-plus-slots'
  if (args.includes('--zellij-full-debug')) return 'full-debug'
  return null
}

export function zellijUiModeCreatesDashboard(mode: SksZellijUiMode): boolean {
  return mode === 'dashboard-plus-slots'
}
