import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { checkZellijCapability } from './zellij-capability.js'
import { runZellij } from './zellij-command.js'

export const ZELLIJ_PANE_PROOF_SCHEMA = 'sks.zellij-pane-proof.v1'

export interface ZellijPaneProofOptions {
  missionId?: string
  require?: boolean
  phase?: string
  ledgerRoot?: string
  sessionName?: string
  expectedLaneCount?: number
  expectedCwd?: string
}

export async function writeZellijPaneProof(root: string, opts: ZellijPaneProofOptions = {}) {
  const outRoot = path.resolve(opts.ledgerRoot || (opts.missionId ? path.join(root, '.sneakoscope', 'missions', opts.missionId) : path.join(root, '.sneakoscope', 'reports')))
  const session = await readJson<any>(path.join(outRoot, 'zellij-session.json'), null)
  const sessionName = opts.sessionName || session?.session_name || null
  const capability = await checkZellijCapability({ root, require: opts.require === true, writeReport: true })
  const command = sessionName
    ? ['--session', sessionName, 'action', 'list-panes', '--json', '--all']
    : ['action', 'list-panes', '--json', '--all']
  const paneRun = capability.status === 'ok'
    ? await runZellij(command, { cwd: root, timeoutMs: 5000, optional: opts.require !== true })
    : null
  const rawRows = parsePaneRows(paneRun?.stdout_tail || '')
  const paneRows = normalizeZellijPaneRows(rawRows)
  const evaluationOpts: { expectedLaneCount?: number; expectedCwd?: string } = { expectedCwd: opts.expectedCwd || root }
  if (opts.expectedLaneCount !== undefined) evaluationOpts.expectedLaneCount = opts.expectedLaneCount
  const evaluation = evaluateZellijPaneProofRows(paneRows, evaluationOpts)
  const blockers = [
    ...capability.blockers,
    ...(opts.require === true && paneRun && !paneRun.ok ? paneRun.blockers.map((blocker) => `zellij_pane_${blocker}`) : []),
    ...(opts.require === true && capability.status === 'ok' && paneRows.length === 0 ? ['zellij_no_panes_listed'] : []),
    ...(opts.require === true ? evaluation.blockers : [])
  ]
  const report = {
    schema: ZELLIJ_PANE_PROOF_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    mission_id: opts.missionId || null,
    phase: opts.phase || 'check',
    session_name: sessionName,
    capability_status: capability.status,
    pane_count: paneRows.length,
    main_pane: evaluation.main_pane,
    lane_panes: evaluation.lane_panes,
    expected_lane_count: evaluation.expected_lane_count,
    lane_count_ok: evaluation.lane_count_ok,
    geometry_distinct: evaluation.geometry_distinct,
    panes: paneRows,
    command: ['zellij', ...command],
    command_result: paneRun,
    blockers,
    warnings: [
      ...capability.warnings,
      ...(!paneRun ? ['zellij_pane_probe_skipped'] : []),
      ...(paneRun && !paneRun.ok && opts.require !== true ? ['zellij_pane_probe_failed_optional'] : [])
    ]
  }
  await writeJsonAtomic(path.join(outRoot, 'zellij-pane-proof.json'), report)
  return report
}

export async function readZellijPaneProof(root: string) {
  return readJson<any>(path.join(root, 'zellij-pane-proof.json'), null)
}

function parsePaneRows(text: string): any[] {
  if (!text.trim()) return []
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed
    if (Array.isArray(parsed?.panes)) return parsed.panes
    return []
  } catch {
    return []
  }
}

export function normalizeZellijPaneRows(rows: any[]): any[] {
  return rows.map((row, index) => {
    const paneId = stringValue(row.pane_id ?? row.paneId ?? row.id ?? row.index ?? index)
    const name = stringValue(row.name ?? row.pane_name ?? row.title ?? row.tab_name ?? '')
    const command = normalizeCommand(row.command ?? row.command_line ?? row.commandline ?? row.running_command ?? row.terminal_command ?? row.pane_command ?? row.executable ?? row.argv)
    const cwd = stringValue(row.cwd ?? row.current_working_directory ?? row.working_directory ?? row.pane_cwd ?? '')
    const exited = Boolean(row.exited === true || row.is_exited === true || row.exit_status != null || /exited|dead|closed/i.test(String(row.state || row.status || '')))
    const geometry = normalizeGeometry(row)
    const role = inferPaneRole({ name, command })
    return {
      raw: row,
      pane_id: paneId,
      name,
      title: stringValue(row.title ?? name),
      command,
      cwd,
      exited,
      geometry,
      role
    }
  })
}

export function evaluateZellijPaneProofRows(panes: any[], opts: { expectedLaneCount?: number; expectedCwd?: string } = {}) {
  const mainPane = panes.find((pane) => pane.role === 'main') || null
  const lanePanes = panes.filter((pane) => pane.role === 'lane')
  const expectedLaneCount = Math.max(1, Number(opts.expectedLaneCount || lanePanes.length || 1))
  const blockers = [
    ...(!mainPane ? ['zellij_main_pane_missing'] : []),
    ...(lanePanes.length === 0 ? ['zellij_lane_pane_missing'] : []),
    ...(lanePanes.length > 0 && lanePanes.length !== expectedLaneCount ? ['zellij_lane_pane_count_mismatch'] : []),
    ...(mainPane?.exited ? ['zellij_main_pane_exited'] : []),
    ...lanePanes.filter((pane) => pane.exited).map((pane) => `zellij_lane_pane_exited:${pane.pane_id}`),
    ...lanePanes.filter((pane) => !/zellij-lane/.test(pane.command)).map((pane) => `zellij_lane_unexpected_command:${pane.pane_id}`),
    ...cwdBlockers([mainPane, ...lanePanes].filter(Boolean), opts.expectedCwd),
    ...(geometryDistinct(mainPane, lanePanes) === false ? ['zellij_lane_geometry_not_distinct'] : [])
  ]
  return {
    main_pane: mainPane,
    lane_panes: lanePanes,
    expected_lane_count: expectedLaneCount,
    lane_count_ok: lanePanes.length === expectedLaneCount,
    geometry_distinct: geometryDistinct(mainPane, lanePanes),
    blockers
  }
}

function inferPaneRole(input: { name: string; command: string }): 'main' | 'lane' | 'unknown' {
  if (/(^|[^a-z])(orchestrator|main)([^a-z]|$)/i.test(input.name)) return 'main'
  if (/\bzellij-lane\b/.test(input.command) || /^slot-\d{3,}$/i.test(input.name)) return 'lane'
  return 'unknown'
}

function normalizeCommand(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(' ')
  return stringValue(value)
}

function stringValue(value: unknown): string {
  return value == null ? '' : String(value)
}

function normalizeGeometry(row: any) {
  const x = numberOrNull(row.x ?? row.left ?? row.pane_x)
  const y = numberOrNull(row.y ?? row.top ?? row.pane_y)
  const width = numberOrNull(row.width ?? row.columns ?? row.cols ?? row.pane_columns)
  const height = numberOrNull(row.height ?? row.rows ?? row.pane_rows)
  return x == null && y == null && width == null && height == null ? null : { x, y, width, height }
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function geometryDistinct(mainPane: any, lanePanes: any[]): boolean | null {
  if (!mainPane?.geometry || lanePanes.some((pane) => !pane.geometry)) return null
  return lanePanes.every((pane) => JSON.stringify(pane.geometry) !== JSON.stringify(mainPane.geometry))
}

function cwdBlockers(panes: any[], expectedCwd?: string): string[] {
  if (!expectedCwd) return []
  const expected = path.resolve(expectedCwd)
  return panes
    .filter((pane) => pane.cwd && !path.resolve(pane.cwd).startsWith(expected))
    .map((pane) => `zellij_pane_unexpected_cwd:${pane.pane_id}`)
}
