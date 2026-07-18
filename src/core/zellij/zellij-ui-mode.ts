export type SksZellijUiMode =
  | 'compact-slots'
  | 'full-debug'

export interface ZellijUiConfig {
  mode: SksZellijUiMode
  color: boolean
  visiblePanes: number | null
  viewports: number
  monitorRows: number
  monitor: boolean
  intervalMs: number
}

export function resolveZellijUiConfig(args: string[] = [], env: NodeJS.ProcessEnv = process.env): ZellijUiConfig {
  return {
    mode: resolveZellijUiMode(args, env),
    color: env.SKS_ZELLIJ_COLOR !== '0' && env.NO_COLOR !== '1',
    visiblePanes: Number(env.SKS_ZELLIJ_VISIBLE_PANES) || null,
    viewports: boundedInt(env.SKS_ZELLIJ_VIEWPORTS, 1, 0, 3),
    monitorRows: Math.max(4, Number(env.SKS_ZELLIJ_MONITOR_ROWS || 12)),
    monitor: env.SKS_ZELLIJ_MONITOR_PANE !== '0',
    intervalMs: Math.max(500, Number(env.SKS_ZELLIJ_REFRESH_MS) || 1000)
  }
}

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
  if (args.includes('--zellij-compact-slots')) return 'compact-slots'
  if (args.includes('--zellij-full-debug')) return 'full-debug'
  return null
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.floor(Number(value ?? fallback))
  const n = Number.isFinite(parsed) ? parsed : fallback
  return Math.max(min, Math.min(n, max))
}
