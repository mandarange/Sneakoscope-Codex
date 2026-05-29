import path from 'node:path'
import { appendJsonl, nowIso, writeJsonAtomic } from '../fsx.js'
import { checkZellijCapability } from './zellij-capability.js'
import { runZellij } from './zellij-command.js'
import { writeZellijLayout, type ZellijLayoutInput } from './zellij-layout-builder.js'
import { writeZellijPaneProof } from './zellij-pane-proof.js'

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
  const createCommand = ['--session', sessionName, '--layout', layout.layout_path]
  const attachCommand = ['attach', sessionName]
  const backgroundCommand = ['attach', '--create-background', sessionName]
  const command = opts.attach === true ? attachCommand : createCommand
  const launch: any = opts.dryRun === true || capability.status !== 'ok'
    ? null
    : opts.attach === true
      ? await runZellij(attachCommand, { cwd: opts.cwd || root, timeoutMs: 30000, optional: opts.requireZellij !== true })
      : {
          create_background: await runZellij(backgroundCommand, { cwd: opts.cwd || root, timeoutMs: 5000, optional: opts.requireZellij !== true }),
          apply_layout: await runZellij(createCommand, { cwd: opts.cwd || root, timeoutMs: 5000, optional: opts.requireZellij !== true })
        }
  const paneProof = await writeZellijPaneProof(root, {
    missionId,
    require: opts.requireZellij === true,
    phase: opts.dryRun === true ? 'dry_run_launch' : 'post_launch',
    ledgerRoot: path.join(root, '.sneakoscope', 'missions', missionId),
    sessionName,
    expectedLaneCount: opts.slotCount || 1,
    expectedCwd: opts.cwd || root
  }).catch((err: any) => ({
    ok: false,
    blockers: [`zellij_pane_proof_exception:${err?.message || String(err)}`]
  }))
  const launchOk = opts.attach === true ? launch?.ok === true : launch?.create_background?.ok === true && launch?.apply_layout?.ok === true
  const ok = capability.ok && (opts.dryRun === true || capability.status !== 'ok' || launchOk) && (opts.requireZellij === true ? paneProof.ok === true : true)
  const blockers = [
    ...capability.blockers,
    ...(launch && opts.attach === true && !launch.ok ? launch.blockers.map((blocker: string) => `zellij_launch_${blocker}`) : []),
    ...(launch && opts.attach !== true && !launch.create_background?.ok ? (launch.create_background?.blockers || ['zellij_background_session_failed']).map((blocker: string) => `zellij_launch_${blocker}`) : []),
    ...(launch && opts.attach !== true && !launch.apply_layout?.ok ? (launch.apply_layout?.blockers || ['zellij_layout_apply_failed']).map((blocker: string) => `zellij_launch_${blocker}`) : []),
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
    command: ['zellij', ...command],
    launch_command: ['zellij', ...createCommand],
    background_command: ['zellij', ...backgroundCommand],
    attach_command: `zellij attach ${sessionName}`,
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
