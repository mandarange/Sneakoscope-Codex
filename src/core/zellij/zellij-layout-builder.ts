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
  slot_count: number
  layout_kdl: string
  launch_command: string[]
  attach_command: string
  main_pane_kind: 'codex_interactive' | 'status_shell'
  codex_args: string[]
  launch_env_keys: string[]
  lane_runtime_manifest: string
  lane_runtime_policies: ZellijLaneRuntimePolicy[]
  initial_worker_panes: number
  monitor_pane_enabled: boolean
  monitor_pane_count: number
  lane_dispatch_policy: {
    mode: 'jsonl_nonblocking'
    fifo_policy: 'disabled_to_avoid_writer_blocking'
    pane_transport: 'zellij_action_optional'
    throttle_ms: number
  }
  lane_resource_policy: {
    nice_level: number
    throttle_ms: number
  }
}

export function buildZellijLayoutKdl(input: ZellijLayoutInput): ZellijLayoutBuild {
  const slotCount = Math.max(0, Number(input.slotCount ?? 1))
  const sessionName = input.sessionName || `sks-${input.missionId}`
  const cwd = path.resolve(input.cwd || process.cwd())
  const ledgerRoot = path.resolve(input.ledgerRoot)
  const title = input.title || `SKS ${input.kind || 'agent'} ${input.missionId}`
  const sksCommand = `${shellQuote(process.execPath)} ${shellQuote(path.join(packageRoot(), 'dist', 'bin', 'sks.js'))}`
  const mainPane = buildMainPaneCommand(input, sksCommand)
  const laneRuntimes: ZellijLaneRuntimePolicy[] = []
  const monitorPaneEnabled = process.env.SKS_ZELLIJ_MONITOR_PANE === '1'
  const monitorPane = monitorPaneEnabled
    ? [
        '        pane name="monitor" size="30%" command="sh" {',
        `            args "-lc" ${kdlString(`${sksCommand} status --json || true; exec ${shellQuote(String(process.env.SHELL || '/bin/zsh'))}`)}`,
        '        }'
      ].join('\n')
    : ''
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
    `    tab name=${kdlString(title)} cwd=${kdlString(cwd)} split_direction="vertical" {`,
    '        pane name="orchestrator" command="sh" {',
    `            args "-lc" ${kdlString(mainPane.command)}`,
    '        }',
    ...(monitorPane ? [monitorPane] : []),
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
    slot_count: slotCount,
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
      pane_transport: 'zellij_action_optional',
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
    ...(/\bpane\s+name="slot-\d+"/.test(text) ? ['zellij_layout_precreated_worker_pane_present'] : []),
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
