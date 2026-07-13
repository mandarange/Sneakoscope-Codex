import path from 'node:path'
import { ensureDir, nowIso, packageRoot, writeTextAtomic } from '../fsx.js'
import { writeZellijLaneRuntimeManifest, type ZellijLaneRuntimePolicy } from './zellij-lane-runtime.js'

export const ZELLIJ_LAYOUT_SCHEMA = 'sks.zellij-layout.v1'

export interface ZellijLayoutInput {
  missionId: string
  sessionName?: string
  ledgerRoot: string
  cwd?: string
  kind?: 'mad' | 'agent' | 'team' | 'naruto'
  /** Deprecated for dynamic swarm UI. Viewport count is controlled by SKS_ZELLIJ_VIEWPORTS. */
  slotCount?: number
  title?: string
  codexBin?: string
  codexArgs?: readonly unknown[]
  launchEnv?: Record<string, unknown>
}

export interface ZellijLayoutBuild {
  schema: typeof ZELLIJ_LAYOUT_SCHEMA
  generated_at: string
  mission_id: string
  session_name: string
  kind: string
  ledger_root: string
  cwd: string
  layout_kdl: string
  launch_command: string[]
  attach_command: string
  main_pane_kind: 'codex_interactive' | 'status_shell'
  codex_args: string[]
  launch_env_keys: string[]
  lane_runtime_manifest: string
  lane_runtime_policies: ZellijLaneRuntimePolicy[]
  viewport_count: number
  ui_architecture: 'monitor_plus_viewports'
  /** Deprecated compatibility field; dynamic swarm layouts do not precreate worker panes. */
  slot_count: number
  initial_worker_panes: number
  monitor_pane_enabled: boolean
  monitor_pane_count: number
  lane_dispatch_policy: {
    mode: 'jsonl_nonblocking'
    fifo_policy: 'disabled_to_avoid_writer_blocking'
    pane_transport: 'monitor_plus_viewports' | 'zellij_action_optional'
    throttle_ms: number
  }
  lane_resource_policy: {
    nice_level: number
    throttle_ms: number
  }
}

export function buildZellijLayoutKdl(input: ZellijLayoutInput): ZellijLayoutBuild {
  const viewportCount = boundedInt(layoutEnvValue(input, 'SKS_ZELLIJ_VIEWPORTS'), 1, 0, 3)
  const refreshMs = boundedInt(layoutEnvValue(input, 'SKS_ZELLIJ_REFRESH_MS'), 1000, 500, 60_000)
  const sessionName = input.sessionName || `sks-${input.missionId}`
  const cwd = path.resolve(input.cwd || process.cwd())
  const ledgerRoot = path.resolve(input.ledgerRoot)
  const title = input.title || `SKS ${input.kind || 'agent'} ${input.missionId}`
  const sksCommand = `${shellQuote(process.execPath)} ${shellQuote(path.join(packageRoot(), 'dist', 'bin', 'sks.js'))}`
  const sksEntry = path.join(packageRoot(), 'dist', 'bin', 'sks.js')
  const mainPane = buildMainPaneCommand(input, sksCommand)
  const laneRuntimes: ZellijLaneRuntimePolicy[] = []
  const monitorPaneSetting = layoutEnvValue(input, 'SKS_ZELLIJ_MONITOR_PANE')
  const monitorPaneEnabled = monitorPaneSetting !== '0'
    && (input.kind === 'mad' || input.kind === 'naruto' || monitorPaneSetting === '1')
  const monitorBlock = monitorPaneEnabled ? [
    '            pane size="35%" name="sks-monitor" {',
    `                command ${kdlString(process.execPath)}`,
    `                args ${kdlArgs([sksEntry, 'zellij-monitor-pane', '--mission', input.missionId, '--interval-ms', String(refreshMs), '--watch'])}`,
    '            }'
  ].join('\n') : ''
  const viewportBlocks = Array.from({ length: viewportCount }, (_, i) => {
    const viewportIndex = String(i + 1)
    return [
      `            pane name=${kdlString(`sks-viewport-${viewportIndex}`)} {`,
      `                    command ${kdlString(process.execPath)}`,
      `                    args ${kdlArgs([sksEntry, 'zellij-viewport-pane', '--mission', input.missionId, '--index', viewportIndex, '--of', String(viewportCount), '--interval-ms', String(refreshMs), '--watch'])}`,
      '            }'
    ].join('\n')
  }).join('\n')
  const layout = [
    'layout {',
    '    default_tab_template {',
    '        pane size=1 borderless=true {',
    '            plugin location="zellij:tab-bar"',
    '        }',
    '        children',
    '        pane size=2 borderless=true {',
    '            plugin location="zellij:status-bar"',
    '        }',
    '    }',
    `    tab name=${kdlString(title)} cwd=${kdlString(cwd)} {`,
    '        pane split_direction="vertical" {',
    '            pane name="orchestrator" size="55%" command="sh" {',
    `                args "-lc" ${kdlString(mainPane.command)}`,
    '            }',
    '            pane split_direction="horizontal" size="45%" {',
    ...(monitorBlock ? [monitorBlock] : []),
    ...(viewportBlocks ? [viewportBlocks] : []),
    '            }',
    '        }',
    '    }',
    '}',
    ''
  ].join('\n')
  return {
    schema: ZELLIJ_LAYOUT_SCHEMA,
    generated_at: nowIso(),
    mission_id: input.missionId,
    session_name: sessionName,
    kind: input.kind || 'agent',
    ledger_root: ledgerRoot,
    cwd,
    viewport_count: viewportCount,
    ui_architecture: 'monitor_plus_viewports',
    slot_count: 0,
    layout_kdl: layout,
    launch_command: ['zellij', 'attach', '--create-background', sessionName, 'options', '--default-layout', '<layout-path>'],
    attach_command: `zellij attach ${shellQuote(sessionName)}`,
    main_pane_kind: mainPane.kind,
    codex_args: mainPane.codexArgs,
    launch_env_keys: mainPane.launchEnvKeys,
    lane_runtime_manifest: path.join(ledgerRoot, 'zellij-lane-runtime.json'),
    lane_runtime_policies: laneRuntimes,
    initial_worker_panes: 0,
    monitor_pane_enabled: monitorPaneEnabled,
    monitor_pane_count: monitorPaneEnabled ? 1 : 0,
    lane_dispatch_policy: {
      mode: 'jsonl_nonblocking',
      fifo_policy: 'disabled_to_avoid_writer_blocking',
      pane_transport: 'monitor_plus_viewports',
      throttle_ms: 0
    },
    lane_resource_policy: {
      nice_level: 0,
      throttle_ms: 0
    }
  }
}

export function validateZellijLayoutKdl(text: string) {
  const blockers = [
    ...(!/\blayout\s*\{/.test(text) ? ['zellij_layout_root_missing'] : []),
    ...(!/\bpane\s+name="orchestrator"/.test(text) ? ['zellij_layout_orchestrator_pane_missing'] : []),
    ...(/\bzellij-lane\b/.test(text) ? ['zellij_layout_precreated_lane_command_present'] : []),
    ...(/\bSKS_ZELLIJ_COMMAND_INBOX=/.test(text) ? ['zellij_layout_lane_inbox_env_present'] : []),
    ...(/\btmux\b/i.test(text) ? ['zellij_layout_references_removed_tmux'] : []),
    ...(braceBalance(text) !== 0 ? ['zellij_layout_unbalanced_braces'] : [])
  ]
  return { ok: blockers.length === 0, blockers }
}

export async function writeZellijLayout(root: string, input: ZellijLayoutInput): Promise<ZellijLayoutBuild & { layout_path: string }> {
  const built = buildZellijLayoutKdl(input)
  await ensureDir(path.resolve(input.ledgerRoot))
  await writeZellijLaneRuntimeManifest(path.resolve(input.ledgerRoot), {
    missionId: built.mission_id,
    sessionName: built.session_name,
    lanes: built.lane_runtime_policies
  })
  const dir = path.join(root, '.sneakoscope', 'layouts')
  await ensureDir(dir)
  const fileName = `${input.kind || 'agent'}-${input.missionId}.kdl`
  const layoutPath = path.join(dir, fileName)
  await writeTextAtomic(layoutPath, built.layout_kdl)
  return { ...built, layout_path: layoutPath }
}

function kdlString(value: unknown): string {
  return JSON.stringify(String(value || ''))
}

function kdlArgs(args: string[]): string {
  return args.map((arg) => kdlString(arg)).join(' ')
}

function nonNegativeInt(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.floor(Number(value ?? fallback))
  const n = Number.isFinite(parsed) ? parsed : fallback
  return Math.max(min, Math.min(n, max))
}

function layoutEnvValue(input: ZellijLayoutInput, key: string): string | undefined {
  const launchValue = input.launchEnv?.[key]
  if (launchValue !== undefined && launchValue !== null && String(launchValue).trim()) return String(launchValue).trim()
  const inherited = process.env[key]
  return inherited === undefined ? undefined : String(inherited)
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function buildMainPaneCommand(input: ZellijLayoutInput, sksCommand: string) {
  const requestedCodexArgs = (input.codexArgs || []).map((arg) => String(arg)).filter(Boolean)
  const shouldLaunchCodex = input.kind === 'mad' || requestedCodexArgs.length > 0
  if (!shouldLaunchCodex) {
    const shell = shellQuote(String(process.env.SHELL || '/bin/zsh'))
    return {
      kind: 'status_shell' as const,
      command: `${sksCommand} status --json || true; exec ${shell}`,
      codexArgs: [],
      launchEnvKeys: []
    }
  }
  const codexArgs = withCodexScrollbackArgs(requestedCodexArgs)
  const launchEnv = sanitizeLaunchEnv(input.launchEnv || {})
  const envPrefix = launchEnv.map(([key, value]) => `${key}=${shellQuote(value)}`)
  const codexBin = shellQuote(String(input.codexBin || process.env.SKS_CODEX_BIN || 'codex'))
  return {
    kind: 'codex_interactive' as const,
    command: [...envPrefix, 'exec', codexBin, ...codexArgs.map(shellQuote)].join(' '),
    codexArgs,
    launchEnvKeys: launchEnv.map(([key]) => key)
  }
}

function withCodexScrollbackArgs(args: string[]): string[] {
  if (process.env.SKS_ZELLIJ_CODEX_ALT_SCREEN === '1') return args
  if (args.includes('--no-alt-screen')) return args
  return ['--no-alt-screen', ...args]
}

function sanitizeLaunchEnv(env: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(env)
    .filter(([key, value]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && value != null && String(value) !== '')
    .map(([key, value]) => [key, String(value)] as [string, string])
    .sort(([left], [right]) => left.localeCompare(right))
}

function braceBalance(text: string): number {
  let balance = 0
  for (const char of text) {
    if (char === '{') balance += 1
    else if (char === '}') balance -= 1
    if (balance < 0) return balance
  }
  return balance
}
