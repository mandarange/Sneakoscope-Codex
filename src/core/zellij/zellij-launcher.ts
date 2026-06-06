import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { appendJsonl, nowIso, sha256, writeJsonAtomic } from '../fsx.js'
import { checkZellijCapability } from './zellij-capability.js'
import { formatZellijCommand, resolveZellijProcessEnvMeta, runZellij } from './zellij-command.js'
import { writeZellijLayout, type ZellijLayoutInput } from './zellij-layout-builder.js'
import { writeZellijClipboardConfig } from './zellij-clipboard-config.js'
import { writeZellijPaneProof, type ZellijPaneProofOptions } from './zellij-pane-proof.js'

export const ZELLIJ_SESSION_SCHEMA = 'sks.zellij-session.v1'
export const ZELLIJ_SESSION_NAME_MAX = 64

export interface ZellijLaunchOptions {
  root?: string
  missionId?: string
  session?: string
  cwd?: string
  ledgerRoot?: string
  slotCount?: number
  kind?: 'mad' | 'agent' | 'team' | 'naruto'
  dryRun?: boolean
  attach?: boolean
  requireZellij?: boolean
  codexBin?: string
  codexArgs?: readonly unknown[]
  launchEnv?: Record<string, unknown>
}

export async function launchZellijLayout(opts: ZellijLaunchOptions = {}) {
  const root = path.resolve(opts.root || process.cwd())
  const missionId = String(opts.missionId || `M-${Date.now().toString(36)}`)
  const ledgerRoot = path.resolve(opts.ledgerRoot || path.join(root, '.sneakoscope', 'missions', missionId, 'agents'))
  const sessionName = sanitizeZellijSessionName(opts.session || `sks-${missionId}`)
  const layoutInput: ZellijLayoutInput = {
    missionId,
    sessionName,
    ledgerRoot,
    cwd: opts.cwd || root,
    kind: opts.kind || 'agent',
    slotCount: opts.slotCount ?? 1,
    title: `SKS ${opts.kind || 'agent'} ${missionId}`,
    codexArgs: opts.codexArgs || [],
    launchEnv: opts.launchEnv || {}
  }
  if (opts.codexBin) layoutInput.codexBin = opts.codexBin
  const layout = await writeZellijLayout(root, layoutInput)
  const capability = await checkZellijCapability({ root, require: opts.requireZellij === true })
  // Configure the clipboard pipeline so selections inside the session reach the OS
  // clipboard (Zellij's default OSC-52 copy is dropped by Terminal.app etc.). The
  // copy option flags are appended AFTER `--default-layout <path>` so the launch
  // command prefix ['zellij','attach','--create-background',session,'options','--default-layout',...]
  // is preserved (required by the zellij launch-command-truth gate + E2E assertions).
  const clipboard = await writeZellijClipboardConfig(root, missionId)
  const createCommand = ['attach', '--create-background', sessionName, 'options', '--default-layout', layout.layout_path, ...clipboard.optionFlags]
  const attachCommand = ['attach', sessionName]
  const zellijEnv = resolveZellijProcessEnvMeta()
  const launch: any = opts.dryRun === true || capability.status !== 'ok'
    ? null
    : {
        create_background: await runZellij(createCommand, { cwd: opts.cwd || root, timeoutMs: 5000, optional: opts.requireZellij !== true })
      }
  const paneProofOpts: ZellijPaneProofOptions = {
    missionId,
    require: opts.requireZellij === true,
    phase: opts.dryRun === true ? 'dry_run_launch' : 'post_launch',
    ledgerRoot: path.join(root, '.sneakoscope', 'missions', missionId),
    sessionName,
    expectedLaneCount: 0,
    expectedCwd: opts.cwd || root
  }
  if (layout.main_pane_kind === 'codex_interactive') paneProofOpts.expectedMainCommandIncludes = 'codex'
  const paneProof = await writeZellijPaneProof(root, paneProofOpts).catch((err: any) => ({
    ok: false,
    blockers: [`zellij_pane_proof_exception:${err?.message || String(err)}`]
  }))
  const launchOk = launch?.create_background?.ok === true
  const ok = capability.ok && (opts.dryRun === true || capability.status !== 'ok' || launchOk) && (opts.requireZellij === true ? paneProof.ok === true : true)
  const blockers = [
    ...capability.blockers,
    ...(launch && !launch.create_background?.ok ? (launch.create_background?.blockers || ['zellij_background_session_failed']).map((blocker: string) => `zellij_launch_${blocker}`) : []),
    ...(opts.requireZellij === true && paneProof.ok !== true ? (paneProof.blockers || ['zellij_pane_proof_failed']).map((blocker: string) => `zellij_launch_${blocker}`) : [])
  ]
  const report = {
    schema: ZELLIJ_SESSION_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0 && ok,
    kind: opts.kind || 'agent',
    mission_id: missionId,
    session_name: sessionName,
    root,
    cwd: path.resolve(opts.cwd || root),
    ledger_root: ledgerRoot,
    layout_path: layout.layout_path,
    layout_artifact: path.relative(root, layout.layout_path),
    main_pane_kind: layout.main_pane_kind,
    codex_pane: {
      enabled: layout.main_pane_kind === 'codex_interactive',
      args: layout.codex_args,
      launch_env_keys: layout.launch_env_keys,
      bin: opts.codexBin || process.env.SKS_CODEX_BIN || 'codex'
    },
    command: ['zellij', ...createCommand],
    launch_command: ['zellij', ...createCommand],
    launch_command_with_env: formatZellijCommand(createCommand, zellijEnv),
    background_command: ['zellij', ...createCommand],
    background_command_with_env: formatZellijCommand(createCommand, zellijEnv),
    attach_command: `zellij attach ${sessionName}`,
    attach_command_with_env: formatZellijCommand(attachCommand, zellijEnv),
    attach_requested: opts.attach === true,
    zellij_socket_dir: zellijEnv.zellij_socket_dir,
    zellij_socket_dir_source: zellijEnv.zellij_socket_dir_source,
    clipboard_config_path: clipboard.config_path,
    clipboard_copy_command: clipboard.copy_command,
    clipboard_mouse_mode: clipboard.mouse_mode,
    pane_proof_path: path.join(root, '.sneakoscope', 'missions', missionId, 'zellij-pane-proof.json'),
    pane_proof: paneProof,
    dry_run: opts.dryRun === true,
    capability,
    launch,
    blockers,
    warnings: [
      ...capability.warnings,
      ...(opts.dryRun === true ? ['zellij_launch_dry_run'] : []),
      ...(!launch && capability.status !== 'ok' && !opts.requireZellij ? ['zellij_launch_skipped_optional_missing'] : [])
    ]
  }
  const sessionPath = path.join(root, '.sneakoscope', 'missions', missionId, 'zellij-session.json')
  await writeJsonAtomic(sessionPath, report)
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'missions', missionId, 'zellij-layout.kdl.json'), { ...layout, layout_kdl: undefined })
  await appendJsonl(path.join(root, '.sneakoscope', 'missions', missionId, 'zellij-session-events.jsonl'), {
    schema: 'sks.zellij-session-event.v1',
    ts: nowIso(),
    event_type: opts.dryRun === true ? 'zellij_launch_dry_run' : 'zellij_launch_attempted',
    report: path.relative(root, sessionPath)
  })
  return report
}

export async function launchMadZellijUi(args: readonly unknown[] = [], opts: ZellijLaunchOptions = {}) {
  const session = readOption(args, '--session', opts.session || readOption(args, '--workspace', null))
  const launchOpts: ZellijLaunchOptions = {
    ...opts,
    kind: 'mad',
    slotCount: opts.slotCount ?? 1
  }
  const resolvedSession = session || opts.session
  if (resolvedSession) launchOpts.session = resolvedSession
  return launchZellijLayout(launchOpts)
}

export async function launchTeamZellijView(opts: ZellijLaunchOptions = {}) {
  return launchZellijLayout({
    ...opts,
    kind: 'team',
    slotCount: opts.slotCount ?? 5
  })
}

export interface ZellijAttachResult {
  ok: boolean
  status: number | null
  signal: NodeJS.Signals | null
  error?: string
}

/**
 * Attach the current terminal to an existing Zellij session in the foreground.
 *
 * `launchZellijLayout` only ever *creates* a detached background session, which
 * is correct for proof/automation but means an interactive launch (e.g.
 * `sks --mad`) never actually opens anything. This helper performs the
 * follow-up foreground attach, inheriting stdio so the session takes over the
 * user's terminal until they detach. It is a no-op-style failure (never throws)
 * when Zellij is missing or attach fails, so callers can fall back to printing a
 * manual attach hint.
 */
export function attachZellijSessionInteractive(
  sessionName: string,
  opts: { cwd?: string; configPath?: string } = {}
): ZellijAttachResult {
  if (!sessionName) return { ok: false, status: null, signal: null, error: 'missing_session_name' }
  const meta = resolveZellijProcessEnvMeta()
  const env: NodeJS.ProcessEnv = { ...process.env }
  if (meta.zellij_socket_dir && !env.ZELLIJ_SOCKET_DIR) env.ZELLIJ_SOCKET_DIR = meta.zellij_socket_dir
  // Steer the foreground attach at our generated clipboard config so the interactive
  // session honors copy_command=pbcopy + copy_on_select. The `options` subcommand only
  // configures the *created* background session, so the attach needs its own config
  // delivery; ZELLIJ_CONFIG_FILE avoids reordering CLI args. Defer to a user-exported
  // ZELLIJ_CONFIG_FILE if they already set one.
  if (opts.configPath && !env.ZELLIJ_CONFIG_FILE) env.ZELLIJ_CONFIG_FILE = opts.configPath
  try {
    const result = spawnSync('zellij', ['attach', sessionName], {
      cwd: opts.cwd || process.cwd(),
      env,
      stdio: 'inherit'
    })
    if (result.error) return { ok: false, status: null, signal: null, error: result.error.message }
    return { ok: result.status === 0, status: result.status ?? null, signal: result.signal ?? null }
  } catch (err: any) {
    return { ok: false, status: null, signal: null, error: err?.message || String(err) }
  }
}

export function sanitizeZellijSessionName(value: unknown): string {
  const cleaned = String(value || 'sks-session').replace(/[^A-Za-z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!cleaned) return 'sks-session'
  if (cleaned.length <= ZELLIJ_SESSION_NAME_MAX) return cleaned
  const suffix = sha256(cleaned).slice(0, 8)
  const prefix = cleaned.slice(0, ZELLIJ_SESSION_NAME_MAX - suffix.length - 1).replace(/[-_.:]+$/g, '')
  return `${prefix}-${suffix}`.slice(0, ZELLIJ_SESSION_NAME_MAX)
}

function readOption(args: readonly unknown[], name: string, fallback: string | null): string | null {
  const list = args.map((arg) => String(arg))
  const index = list.indexOf(name)
  return index >= 0 && list[index + 1] ? String(list[index + 1]) : fallback
}
