import path from 'node:path'
import { ensureDir, nowIso, writeJsonAtomic } from '../fsx.js'
import { runZellij, type ZellijCommandResult } from './zellij-command.js'
import { extractZellijPaneIdFromOutput } from './zellij-lane-runtime.js'
import { buildZellijDashboardSnapshot, type ZellijDashboardSnapshot } from './zellij-dashboard-renderer.js'

export const ZELLIJ_DASHBOARD_PANE_SCHEMA = 'sks.zellij-dashboard-pane.v1'

export interface ZellijDashboardPaneRecord {
  schema: typeof ZELLIJ_DASHBOARD_PANE_SCHEMA
  generated_at: string
  ok: boolean
  mission_id: string
  session_name: string
  pane_title: string
  pane_id: string | null
  pane_id_source: 'zellij_dashboard_new_pane_stdout' | 'zellij_dashboard_list_panes' | 'zellij_dashboard_missing'
  pane_kind: 'dashboard'
  worker_pane: false
  command: string
  launch: ZellijCommandResult | null
  list_panes: ZellijCommandResult | null
  dump_screen: ZellijCommandResult | null
  snapshot: ZellijDashboardSnapshot
  blockers: string[]
}

export async function openZellijDashboardPane(input: {
  root: string
  missionId: string
  sessionName: string
  cwd?: string
  snapshot?: Partial<ZellijDashboardSnapshot>
}): Promise<ZellijDashboardPaneRecord> {
  const root = path.resolve(input.root)
  const cwd = input.cwd || root
  const paneTitle = `dashboard · ${input.missionId}`
  const dashboardDir = path.join(root, '.sneakoscope', 'missions', input.missionId)
  await ensureDir(dashboardDir)
  const snapshot = buildZellijDashboardSnapshot({ ...(input.snapshot || {}), mission_id: input.missionId })
  const snapshotPath = path.join(dashboardDir, 'zellij-dashboard-snapshot.json')
  await writeJsonAtomic(snapshotPath, snapshot)
  const watchScript = path.join(root, 'dist', 'scripts', 'zellij-dashboard-watch.js')
  const command = `${shellQuote(process.execPath)} ${shellQuote(watchScript)} --snapshot ${shellQuote(snapshotPath)} --interval-ms 1000`
  const createSession = await runZellij(['attach', '--create-background', input.sessionName], { cwd, timeoutMs: 5000, optional: true })
  const launch = await runZellij(['--session', input.sessionName, 'action', 'new-pane', '--direction', 'right', '--name', paneTitle, '--', 'sh', '-lc', command], {
    cwd,
    timeoutMs: 5000,
    optional: false
  })
  const stdoutPaneId = launch.ok ? extractZellijPaneIdFromOutput(launch.stdout_tail) : null
  const listed = await runZellij(['--session', input.sessionName, 'action', 'list-panes', '--json', '--all'], { cwd, timeoutMs: 5000, optional: true })
  const rows = parseRows(listed.stdout_tail)
  const pane = stdoutPaneId ? null : rows.find((row) => String(row.title || row.name || '').includes(paneTitle))
  const paneId = stdoutPaneId || pane?.pane_id || pane?.paneId || pane?.id || null
  const dump = await runZellij(['--session', input.sessionName, 'action', 'dump-screen'], { cwd, timeoutMs: 5000, optional: true })
  const source = stdoutPaneId ? 'zellij_dashboard_new_pane_stdout' : paneId ? 'zellij_dashboard_list_panes' : 'zellij_dashboard_missing'
  const blockers = [
    ...(createSession.ok || /Session already exists/i.test(createSession.stderr_tail || '') ? [] : createSession.blockers.map((blocker) => `zellij_dashboard_session_${blocker}`)),
    ...(launch.ok ? [] : launch.blockers.map((blocker) => `zellij_dashboard_pane_${blocker}`)),
    ...(paneId ? [] : ['zellij_dashboard_pane_id_missing'])
  ]
  const record: ZellijDashboardPaneRecord = {
    schema: ZELLIJ_DASHBOARD_PANE_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    mission_id: input.missionId,
    session_name: input.sessionName,
    pane_title: paneTitle,
    pane_id: paneId == null ? null : String(paneId),
    pane_id_source: source,
    pane_kind: 'dashboard',
    worker_pane: false,
    command,
    launch,
    list_panes: listed,
    dump_screen: dump,
    snapshot,
    blockers
  }
  await writeJsonAtomic(path.join(dashboardDir, 'zellij-dashboard-pane.json'), record)
  return record
}

function parseRows(text: unknown): any[] {
  if (!String(text || '').trim()) return []
  try {
    const parsed = JSON.parse(String(text))
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.panes) ? parsed.panes : []
  } catch {
    return []
  }
}

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}
