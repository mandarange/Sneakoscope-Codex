import path from 'node:path'
import { appendJsonl, nowIso, writeJsonAtomic } from '../fsx.js'
import { checkZellijCapability } from './zellij-capability.js'
import { runZellij } from './zellij-command.js'
import { writeZellijLayout, type ZellijLayoutInput } from './zellij-layout-builder.js'

export const ZELLIJ_SESSION_SCHEMA = 'sks.zellij-session.v1'

export interface ZellijLaunchOptions {
  root?: string
  missionId?: string
  session?: string
  cwd?: string
  ledgerRoot?: string
  slotCount?: number
  kind?: 'mad' | 'agent' | 'team'
  dryRun?: boolean
  attach?: boolean
  requireZellij?: boolean
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
    slotCount: opts.slotCount || 1,
    title: `SKS ${opts.kind || 'agent'} ${missionId}`
  }
  const layout = await writeZellijLayout(root, layoutInput)
  const capability = await checkZellijCapability({ root, require: opts.requireZellij === true })
  const command = opts.attach === true
    ? ['--session-name', sessionName, '--layout', layout.layout_path]
    : ['attach', '--create-background', sessionName, 'options', '--default-layout', layout.layout_path]
  const launch = opts.dryRun === true || capability.status !== 'ok'
    ? null
    : await runZellij(command, { cwd: opts.cwd || root, timeoutMs: opts.attach === true ? 30000 : 10000, optional: opts.requireZellij !== true })
  const ok = capability.ok && (opts.dryRun === true || capability.status !== 'ok' || launch?.ok === true)
  const blockers = [
    ...capability.blockers,
    ...(launch && !launch.ok ? launch.blockers.map((blocker) => `zellij_launch_${blocker}`) : [])
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
    command: ['zellij', ...command],
    attach_command: `zellij attach ${sessionName}`,
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
    slotCount: opts.slotCount || 1
  }
  const resolvedSession = session || opts.session
  if (resolvedSession) launchOpts.session = resolvedSession
  return launchZellijLayout(launchOpts)
}

export async function launchTeamZellijView(opts: ZellijLaunchOptions = {}) {
  return launchZellijLayout({
    ...opts,
    kind: 'team',
    slotCount: opts.slotCount || 5
  })
}

export function sanitizeZellijSessionName(value: unknown): string {
  const cleaned = String(value || 'sks-session').replace(/[^A-Za-z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned.slice(0, 80) || 'sks-session'
}

function readOption(args: readonly unknown[], name: string, fallback: string | null): string | null {
  const list = args.map((arg) => String(arg))
  const index = list.indexOf(name)
  return index >= 0 && list[index + 1] ? String(list[index + 1]) : fallback
}
