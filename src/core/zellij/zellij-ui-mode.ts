export type SksZellijUiMode =
  | 'compact-slots'
  | 'dashboard-plus-slots'
  | 'full-debug'

export function resolveZellijUiMode(args: string[] = [], env: NodeJS.ProcessEnv = process.env): SksZellijUiMode {
  const fromEnv = String(env.SKS_ZELLIJ_UI_MODE || '').trim()
  if (fromEnv === 'full-debug') return 'full-debug'
  if (fromEnv === 'dashboard-plus-slots') return 'dashboard-plus-slots'
  if (args.includes('--zellij-dashboard')) return 'dashboard-plus-slots'
  if (args.includes('--zellij-full-debug')) return 'full-debug'
  return 'compact-slots'
}

export function zellijUiModeCreatesDashboard(mode: SksZellijUiMode): boolean {
  return mode !== 'compact-slots'
}
