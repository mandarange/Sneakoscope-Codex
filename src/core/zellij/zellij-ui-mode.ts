export type SksZellijUiMode =
  | 'compact-slots'
  | 'dashboard-plus-slots'
  | 'full-debug'

export function resolveZellijUiMode(args: string[] = [], env: NodeJS.ProcessEnv = process.env): SksZellijUiMode {
  return resolveExplicitZellijUiMode(args, env) || 'compact-slots'
}

export function resolveZellijWorkerPaneUiMode(args: string[] = [], env: NodeJS.ProcessEnv = process.env): SksZellijUiMode {
  // Default worker panes to the live slot renderer (compact-slots). In
  // 'full-debug' the pane runs the worker process itself, but the worker is
  // invoked with --json and the codex SDK streams events to JSONL files — so
  // the pane stays blank until the worker exits. The slot renderer re-reads
  // heartbeat/event/stdout artifacts every second and actually shows what each
  // parallel worker is doing in real time. 'full-debug' remains available via
  // --zellij-full-debug or SKS_ZELLIJ_UI_MODE=full-debug.
  return resolveExplicitZellijUiMode(args, env) || 'compact-slots'
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
