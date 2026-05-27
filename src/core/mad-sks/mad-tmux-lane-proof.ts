import path from 'node:path'
import { nowIso, runProcess, writeJsonAtomic } from '../fsx.js'

export const MAD_SKS_TMUX_LANE_PROOF_SCHEMA = 'sks.mad-sks-tmux-lane-ui.v1'

export async function writeMadSksTmuxLaneProof(input: {
  root: string
  missionDir: string
  missionId: string
  launch: any
  required?: boolean
}) {
  const session = String(input.launch?.opened?.session || input.launch?.session || input.launch?.plan?.session || '')
  const terminalProgram = process.env.TERM_PROGRAM || (process.env.WARP_SESSION_ID ? 'Warp' : 'unknown')
  const list = Array.isArray(input.launch?.list_panes_rows)
    ? { ok: true, rows: input.launch.list_panes_rows, stderr: '' }
    : session ? await listTmuxPanes(session) : { ok: false, rows: [], stderr: 'tmux_session_missing' }
  const visibleLaneContract = Boolean(input.launch?.created || input.launch?.opened?.ok || input.launch?.opened?.created) && list.rows.length > 0
  const proofLevel = visibleLaneContract ? 'proven' : input.required === true ? 'real_required_missing' : 'blocked'
  const report = {
    schema: MAD_SKS_TMUX_LANE_PROOF_SCHEMA,
    generated_at: nowIso(),
    ok: visibleLaneContract,
    proof_level: proofLevel,
    mission_id: input.missionId,
    terminal_program: terminalProgram,
    warp_detected: terminalProgram === 'Warp' || Boolean(process.env.WARP_SESSION_ID),
    tmux_session_name: session || null,
    expected_lane_layout: 'MAD-SKS full-access Codex lane visible in tmux right/main pane',
    attach_command: session ? `tmux attach -t ${session}` : null,
    visible_lane_contract: visibleLaneContract,
    list_panes_ok: list.ok,
    pane_count: list.rows.length,
    panes: list.rows,
    operator_action_hint: visibleLaneContract ? null : 'Open the attach command in Warp/tmux and verify the MAD-SKS Codex lane is visible.',
    blockers: visibleLaneContract ? [] : ['mad_sks_tmux_lane_ui_not_visible']
  }
  await writeJsonAtomic(path.join(input.missionDir, 'mad-sks-tmux-lane-ui.json'), report)
  await writeJsonAtomic(path.join(input.root, '.sneakoscope', 'reports', 'mad-sks-tmux-lane-ui.json'), report)
  return report
}

async function listTmuxPanes(session: string) {
  try {
    const result = await runProcess('tmux', ['list-panes', '-t', session, '-F', '#{session_name}\t#{window_index}\t#{pane_index}\t#{pane_id}\t#{pane_current_command}'], {
      timeoutMs: 3000,
      maxOutputBytes: 64 * 1024
    })
    const rows = result.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
      const [session_name = '', window_index = '', pane_index = '', pane_id = '', pane_current_command = ''] = line.split('\t')
      return { session_name, window_index, pane_index, pane_id, pane_current_command }
    })
    return { ok: result.code === 0, rows, stderr: result.stderr }
  } catch (err: unknown) {
    return { ok: false, rows: [], stderr: err instanceof Error ? err.message : String(err) }
  }
}
