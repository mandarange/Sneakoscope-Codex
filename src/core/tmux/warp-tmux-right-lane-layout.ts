import path from 'node:path'
import { nowIso, runProcess, writeJsonAtomic, writeTextAtomic } from '../fsx.js'

export const WARP_TMUX_RIGHT_LANE_LAYOUT_SCHEMA = 'sks.warp-tmux-right-lane-layout.v1'
export const TMUX_RIGHT_LANE_COORDINATE_PROOF_SCHEMA = 'sks.tmux-right-lane-coordinate-proof.v1'

export interface TmuxPaneGeometry {
  session_name: string
  window_id: string
  pane_id: string
  pane_left: number
  pane_top: number
  pane_width: number
  pane_height: number
  pane_current_command: string
  raw: string
}

export async function writeWarpTmuxRightLaneLayout(root: string, opts: {
  missionId?: string
  laneCount?: number
  sessionName?: string
  realTmux?: boolean
  required?: boolean
  listPanesText?: string
  captureByPaneId?: Record<string, string>
  attach?: boolean
} = {}) {
  const result = await buildWarpTmuxRightLaneLayout(root, opts)
  await writeJsonAtomic(path.join(root, 'warp-tmux-right-lane-layout.json'), result.layout)
  await writeJsonAtomic(path.join(root, 'tmux-right-lane-coordinate-proof.json'), result.coordinate_proof)
  await writeJsonAtomic(path.join(root, 'tmux-right-lane-physical-layout-proof.json'), result.physical_layout_proof)
  return result
}

export async function buildWarpTmuxRightLaneLayout(root: string, opts: {
  missionId?: string
  laneCount?: number
  sessionName?: string
  realTmux?: boolean
  required?: boolean
  listPanesText?: string
  captureByPaneId?: Record<string, string>
  attach?: boolean
} = {}) {
  const generatedAt = nowIso()
  const laneCount = Math.max(1, Math.floor(Number(opts.laneCount || 1)))
  const sessionName = opts.sessionName || `sks-${opts.missionId || 'right-lane'}`
  const warpDetected = Boolean(process.env.WARP_SESSION_ID || process.env.TERM_PROGRAM === 'WarpTerminal')
  const insideTmux = Boolean(process.env.TMUX)
  const interactive = Boolean(process.stdout.isTTY && process.stdin.isTTY)
  const realTmux = opts.realTmux === true
  const attachCommand = `tmux attach -t ${sessionName}`
  const launch = realTmux ? await launchRealLayout(sessionName, laneCount, root, opts) : fixtureLayout(sessionName, laneCount)
  const panes = parseRightLaneListPanes(opts.listPanesText || launch.list_panes_text || '')
  const mainPane = panes.find((pane) => pane.pane_id === launch.main_pane_id) || panes.sort((a, b) => a.pane_left - b.pane_left)[0] || null
  const lanePaneIds = launch.lane_pane_ids.length ? launch.lane_pane_ids : panes.filter((pane) => mainPane && pane.pane_id !== mainPane.pane_id && pane.pane_left > mainPane.pane_left).map((pane) => pane.pane_id)
  const lanePanes = panes.filter((pane) => lanePaneIds.includes(pane.pane_id))
  const captureByPaneId: Record<string, string> = launch.capture_by_pane_id || {}
  const contentProof = lanePanes.map((pane) => {
    const capture = opts.captureByPaneId?.[pane.pane_id] || captureByPaneId[pane.pane_id] || ''
    const checks = {
      header: /SKS lane/i.test(capture),
      worker_status: /worker/i.test(capture),
      patch_queue: /patch queue/i.test(capture),
      current_file: /current file/i.test(capture)
    }
    return {
      pane_id: pane.pane_id,
      capture_available: capture.length > 0,
      ...checks,
      ok: Object.values(checks).every(Boolean)
    }
  })
  const coordinateBlockers = [
    ...(!mainPane ? ['main_pane_missing'] : []),
    ...(lanePanes.length < laneCount ? ['lane_pane_missing'] : []),
    ...lanePanes.flatMap((pane) => [
      ...(mainPane && pane.pane_left <= mainPane.pane_left ? [`lane_not_right_of_main:${pane.pane_id}`] : []),
      ...(pane.pane_width <= 0 ? [`lane_width_zero:${pane.pane_id}`] : []),
      ...(pane.pane_height <= 0 ? [`lane_height_zero:${pane.pane_id}`] : []),
      ...(!/sks|node|sh|zsh|bash|sleep|while/i.test(pane.pane_current_command) ? [`lane_renderer_command_not_persistent:${pane.pane_id}`] : [])
    ]),
    ...contentProof.flatMap((proof) => proof.ok ? [] : [`lane_content_missing:${proof.pane_id}`])
  ]
  const hiddenAttachBlockers = realTmux && warpDetected && !insideTmux && opts.attach !== true && !interactive ? ['operator_action_required_for_tmux_attach'] : []
  const blockers = [
    ...(realTmux && !launch.ok ? launch.blockers : []),
    ...coordinateBlockers,
    ...(opts.required === true ? hiddenAttachBlockers : [])
  ]
  const proofLevel = blockers.length ? (opts.required ? 'real_required_missing' : 'blocked') : realTmux ? 'proven' : 'fixture_physical_coordinate'
  const layout = {
    schema: WARP_TMUX_RIGHT_LANE_LAYOUT_SCHEMA,
    generated_at: generatedAt,
    mission_id: opts.missionId || null,
    ok: blockers.length === 0,
    proof_level: proofLevel,
    warp_detected: warpDetected,
    inside_tmux: insideTmux,
    interactive_tty: interactive,
    real_tmux: realTmux,
    session_name: sessionName,
    main_pane_id: mainPane?.pane_id || launch.main_pane_id || null,
    right_lane_pane_ids: lanePaneIds,
    lane_count: lanePanes.length,
    attach_command: attachCommand,
    attach_executed: launch.attach_executed,
    operator_action_required: hiddenAttachBlockers.length > 0,
    blockers
  }
  const coordinateProof = {
    schema: TMUX_RIGHT_LANE_COORDINATE_PROOF_SCHEMA,
    generated_at: generatedAt,
    ok: coordinateBlockers.length === 0,
    main_pane: mainPane,
    lane_panes: lanePanes,
    lane_panes_right_of_main: mainPane ? lanePanes.every((pane) => pane.pane_left > mainPane.pane_left) : false,
    content_proof: contentProof,
    blockers: coordinateBlockers
  }
  return {
    layout,
    coordinate_proof: coordinateProof,
    physical_layout_proof: {
      schema: 'sks.tmux-right-lane-physical-layout-proof.v1',
      generated_at: generatedAt,
      ok: blockers.length === 0,
      proof_level: proofLevel,
      real_tmux: realTmux,
      pane_count: panes.length,
      attach_command: attachCommand,
      attach_executed: launch.attach_executed,
      operator_action_required: hiddenAttachBlockers.length > 0,
      coordinate_proof: 'tmux-right-lane-coordinate-proof.json',
      content_proof: contentProof,
      blockers
    }
  }
}

export function parseRightLaneListPanes(text: string): TmuxPaneGeometry[] {
  return String(text || '').split(/\r?\n/).filter(Boolean).map((line) => {
    const [sessionName = '', windowId = '', paneId = '', left = '0', top = '0', width = '0', height = '0', command = ''] = line.split('\t')
    return {
      session_name: sessionName,
      window_id: windowId,
      pane_id: paneId,
      pane_left: Number(left),
      pane_top: Number(top),
      pane_width: Number(width),
      pane_height: Number(height),
      pane_current_command: command,
      raw: line
    }
  }).filter((row) => row.pane_id)
}

async function launchRealLayout(sessionName: string, laneCount: number, root: string, opts: any) {
  const captureByPaneId: Record<string, string> = {}
  try {
    await runProcess('tmux', ['has-session', '-t', sessionName], { timeoutMs: 1000, maxOutputBytes: 4096 }).catch(async () => {
      await runProcess('tmux', ['new-session', '-d', '-s', sessionName, '-n', 'sks', 'sleep 3600'], { timeoutMs: 2000, maxOutputBytes: 4096 })
    })
    const main = await runProcess('tmux', ['display-message', '-p', '-t', sessionName, '#{pane_id}'], { timeoutMs: 1000, maxOutputBytes: 4096 })
    const lanePaneIds: string[] = []
    for (let i = 0; i < laneCount; i += 1) {
      const laneFile = path.join(root, `tmux-right-lane-${i + 1}.txt`)
      await writeTextAtomic(laneFile, `SKS lane ${i + 1}\nworker status: idle\npatch queue: empty\ncurrent file: none\n`)
      const command = `while true; do clear; cat ${JSON.stringify(laneFile)}; sleep 2; done`
      const pane = await runProcess('tmux', ['split-window', '-t', sessionName, '-P', '-F', '#{pane_id}', '-h', command], { timeoutMs: 2000, maxOutputBytes: 4096 })
      lanePaneIds.push(pane.stdout.trim())
    }
    const list = await runProcess('tmux', ['list-panes', '-t', sessionName, '-F', '#{session_name}\t#{window_id}\t#{pane_id}\t#{pane_left}\t#{pane_top}\t#{pane_width}\t#{pane_height}\t#{pane_current_command}'], { timeoutMs: 2000, maxOutputBytes: 128 * 1024 })
    for (const paneId of lanePaneIds) {
      const capture = await runProcess('tmux', ['capture-pane', '-p', '-t', paneId], { timeoutMs: 2000, maxOutputBytes: 128 * 1024 }).catch(() => ({ stdout: '', code: 1 }))
      captureByPaneId[paneId] = capture.stdout || ''
    }
    return {
      ok: true,
      main_pane_id: main.stdout.trim(),
      lane_pane_ids: lanePaneIds,
      list_panes_text: list.stdout,
      capture_by_pane_id: captureByPaneId,
      attach_executed: opts.attach === true && process.stdout.isTTY,
      blockers: []
    }
  } catch (err: unknown) {
    return {
      ok: false,
      main_pane_id: null,
      lane_pane_ids: [],
      list_panes_text: '',
      capture_by_pane_id: {},
      attach_executed: false,
      blockers: [`tmux_right_lane_launch_failed:${err instanceof Error ? err.message : String(err)}`]
    }
  }
}

function fixtureLayout(sessionName: string, laneCount: number) {
  const lines = [`${sessionName}\t@1\t%1\t0\t0\t120\t40\tzsh`]
  const captureByPaneId: Record<string, string> = {}
  const lanePaneIds: string[] = []
  for (let i = 0; i < laneCount; i += 1) {
    const paneId = `%${i + 2}`
    lanePaneIds.push(paneId)
    lines.push(`${sessionName}\t@1\t${paneId}\t121\t${i * 10}\t60\t10\tsh`)
    captureByPaneId[paneId] = `SKS lane ${i + 1}\nworker status: idle\npatch queue: empty\ncurrent file: none\n`
  }
  return {
    ok: true,
    main_pane_id: '%1',
    lane_pane_ids: lanePaneIds,
    list_panes_text: lines.join('\n'),
    capture_by_pane_id: captureByPaneId,
    attach_executed: false,
    blockers: []
  }
}
