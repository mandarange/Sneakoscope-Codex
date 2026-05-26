import path from 'node:path'
import { exists, nowIso, readJson, readText, runProcess, writeJsonAtomic, writeTextAtomic } from '../fsx.js'

export const TMUX_PHYSICAL_PROOF_SCHEMA = 'sks.tmux-physical-proof.v1'
export const TMUX_PANE_RECONCILIATION_SCHEMA = 'sks.tmux-pane-reconciliation.v1'
export const TMUX_LANE_CONTENT_TRUTH_SCHEMA = 'sks.tmux-lane-content-truth.v1'

export interface TmuxListPaneRow {
  session_name: string
  window_index: string
  pane_index: string
  pane_id: string
  pane_dead: boolean
  pane_current_command: string
  raw: string
}

export interface TmuxPhysicalProofOptions {
  missionId?: string | null
  realTmux?: boolean
  required?: boolean
  phase?: 'snapshot' | 'before_drain' | 'after_drain'
  listPanesText?: string | null
  captureByPaneId?: Record<string, string>
  writeArtifacts?: boolean
}

interface LaneCapture {
  slot_id: string
  pane_id: string
  artifact: string | null
  capture_available: boolean
  slot_id_present: boolean
  generation_or_status_present: boolean
  queue_summary_present: boolean
  stale_content: boolean
  blockers: string[]
}

export async function writeTmuxPhysicalProof(root: string, opts: TmuxPhysicalProofOptions = {}) {
  const proof = await buildTmuxPhysicalProof(root, opts)
  if (opts.writeArtifacts !== false) {
    await writeJsonAtomic(path.join(root, 'agent-tmux-physical-proof.json'), proof)
    await writeJsonAtomic(path.join(root, 'agent-tmux-pane-reconciliation.json'), proof.reconciliation)
    await writeJsonAtomic(path.join(root, 'agent-tmux-lane-content-truth.json'), proof.lane_content_truth)
  }
  return proof
}

export async function buildTmuxPhysicalProof(root: string, opts: TmuxPhysicalProofOptions = {}) {
  const generatedAt = nowIso()
  const realTmux = opts.realTmux === true
  const phase = opts.phase || 'snapshot'
  const supervisor = await readJson<any>(path.join(root, 'agent-tmux-lane-supervisor.json'), null)
  const lanes: any[] = Array.isArray(supervisor?.lanes) ? supervisor.lanes : []
  const tmuxLanes = await readJson<any>(path.join(root, 'agent-tmux-lanes.json'), null)
  const scheduler = await readJson<any>(path.join(root, 'agent-scheduler-state.json'), null)
  const launchLedger = await readText(path.join(root, 'agent-tmux-pane-launch-ledger.jsonl'), '')
  const mode = realTmux ? 'real_tmux' : 'fake_fixture'
  const listResult = realTmux ? await readOrRunListPanes(opts) : unavailableListPanes('real tmux mode not requested')
  const listPanes = parseTmuxListPanes(listResult.stdout)
  const listArtifact = {
    schema: 'sks.tmux-list-panes.v1',
    generated_at: generatedAt,
    mode,
    phase,
    ok: listResult.ok,
    command: 'tmux list-panes -a -F "#{session_name}\\t#{window_index}\\t#{pane_index}\\t#{pane_id}\\t#{pane_dead}\\t#{pane_current_command}"',
    rows: listPanes,
    stderr_tail: redactLocalText(listResult.stderr).slice(-4000),
    unavailable_reason: listResult.ok ? null : listResult.unavailable_reason
  }
  if (opts.writeArtifacts !== false) await writeJsonAtomic(path.join(root, 'agent-tmux-list-panes.json'), listArtifact)

  const captures: LaneCapture[] = []
  for (const lane of lanes) {
    captures.push(await captureLane(root, lane, scheduler, listPanes, opts, phase, realTmux))
  }
  const reconciliation = buildTmuxPaneReconciliation({
    generatedAt,
    missionId: String(opts.missionId || supervisor?.mission_id || ''),
    mode,
    realTmux,
    phase,
    supervisor,
    tmuxLanes,
    launchLedger,
    listPanes
  })
  const laneContentTruth = {
    schema: TMUX_LANE_CONTENT_TRUTH_SCHEMA,
    generated_at: generatedAt,
    mission_id: opts.missionId || supervisor?.mission_id || null,
    mode,
    phase,
    ok: captures.every((row) => row.blockers.length === 0),
    capture_required: realTmux && phase !== 'after_drain',
    captures,
    blockers: captures.flatMap((row) => row.blockers)
  }
  const blockers = [
    ...(!supervisor ? ['tmux_lane_supervisor_missing'] : []),
    ...(realTmux && !listResult.ok && opts.required === true ? ['tmux_list_panes_unavailable'] : []),
    ...(realTmux && listResult.ok && listPanes.length === 0 && phase !== 'after_drain' ? ['tmux_list_panes_empty'] : []),
    ...(realTmux ? reconciliation.blockers : []),
    ...(realTmux && phase !== 'after_drain' ? laneContentTruth.blockers : [])
  ]
  const integrationOptional = realTmux && !listResult.ok && opts.required !== true
  const physicalVerified = realTmux && !integrationOptional && blockers.length === 0 && listResult.ok
  return {
    schema: TMUX_PHYSICAL_PROOF_SCHEMA,
    generated_at: generatedAt,
    mission_id: opts.missionId || supervisor?.mission_id || null,
    mode,
    phase,
    status: integrationOptional ? 'integration_optional' : blockers.length ? 'blocked' : realTmux ? 'passed' : 'fake_fixture',
    ok: integrationOptional || blockers.length === 0,
    physical_tmux_verified: physicalVerified,
    tmux_list_panes_artifact: 'agent-tmux-list-panes.json',
    tmux_capture_pane_artifacts: captures.map((row) => row.artifact).filter(Boolean),
    tmux_pane_id_reconciled: reconciliation.ok,
    drain_before_alive_recorded: reconciliation.drain_before_alive_recorded,
    drain_after_closed_recorded: reconciliation.drain_after_closed_recorded,
    integration_optional: integrationOptional,
    fake_fixture: !realTmux,
    reconciliation,
    lane_content_truth: laneContentTruth,
    blockers
  }
}

export function parseTmuxListPanes(text: string): TmuxListPaneRow[] {
  return String(text || '').split(/\r?\n/).filter(Boolean).map((line) => {
    const [sessionName = '', windowIndex = '', paneIndex = '', paneId = '', paneDead = '', command = ''] = line.split('\t')
    return {
      session_name: sessionName,
      window_index: windowIndex,
      pane_index: paneIndex,
      pane_id: paneId,
      pane_dead: paneDead === '1',
      pane_current_command: command,
      raw: line
    }
  }).filter((row) => row.pane_id)
}

export function buildTmuxPaneReconciliation(input: {
  generatedAt?: string
  missionId?: string | null
  mode?: string
  realTmux?: boolean
  phase?: string
  supervisor?: any
  tmuxLanes?: any
  launchLedger?: string
  listPanes?: TmuxListPaneRow[]
}) {
  const generatedAt = input.generatedAt || nowIso()
  const lanes: any[] = Array.isArray(input.supervisor?.lanes) ? input.supervisor.lanes : []
  const listPaneIds = new Set((input.listPanes || []).map((row) => row.pane_id))
  const launchBySlot = parseLaunchLedger(input.launchLedger || '')
  const manifestBySlot = new Map<string, string>()
  for (const lane of Array.isArray(input.tmuxLanes?.lanes) ? input.tmuxLanes.lanes : []) {
    if (lane?.slot_id && lane?.pane_id) manifestBySlot.set(String(lane.slot_id), String(lane.pane_id))
  }
  const records = lanes.map((lane) => {
    const slotId = String(lane.slot_id || '')
    const paneId = String(lane.pane_id || '')
    const fakePane = paneId.startsWith('fake-pane-')
    const launchPane = launchBySlot.get(slotId) || null
    const manifestPane = manifestBySlot.get(slotId) || null
    const listed = listPaneIds.has(paneId)
    const closedStateRecorded = lane.drained === true && Boolean(lane.closed_at)
    const beforeAliveOk = input.phase === 'after_drain' ? true : listed
    const afterClosedOk = input.phase === 'after_drain' ? (!listed || closedStateRecorded) : true
    const blockers = [
      ...(input.realTmux && fakePane ? ['fake_tmux_pane_id_in_real_mode'] : []),
      ...(input.realTmux && paneId && !validTmuxPaneId(paneId) ? ['invalid_real_tmux_pane_id'] : []),
      ...(input.realTmux && input.phase !== 'after_drain' && !listed ? ['supervisor_pane_missing_from_list_panes'] : []),
      ...(launchPane && launchPane !== paneId ? ['launch_ledger_supervisor_pane_mismatch'] : []),
      ...(manifestPane && manifestPane !== paneId ? ['lane_manifest_supervisor_pane_mismatch'] : []),
      ...(input.realTmux && input.phase === 'after_drain' && listed && !closedStateRecorded ? ['drained_pane_still_listed_without_closed_state'] : [])
    ]
    return {
      slot_id: slotId,
      supervisor_pane_id: paneId,
      launch_ledger_pane_id: launchPane,
      lane_manifest_pane_id: manifestPane,
      list_panes_contains_supervisor_pane: listed,
      fake_pane_id: fakePane,
      before_drain_alive_ok: beforeAliveOk,
      after_drain_closed_ok: afterClosedOk,
      blockers
    }
  })
  const blockers = records.flatMap((row) => row.blockers.map((blocker) => `${blocker}:${row.slot_id}`))
  return {
    schema: TMUX_PANE_RECONCILIATION_SCHEMA,
    generated_at: generatedAt,
    mission_id: input.missionId || input.supervisor?.mission_id || null,
    mode: input.mode || (input.realTmux ? 'real_tmux' : 'fake_fixture'),
    reconciliation_mode: input.realTmux ? 'real_tmux' : 'fake_fixture',
    phase: input.phase || 'snapshot',
    ok: blockers.length === 0,
    lane_count: lanes.length,
    list_panes_count: (input.listPanes || []).length,
    drain_before_alive_recorded: records.length > 0 && records.every((row) => row.before_drain_alive_ok),
    drain_after_closed_recorded: records.length > 0 && records.every((row) => row.after_drain_closed_ok),
    records,
    blockers
  }
}

async function readOrRunListPanes(opts: TmuxPhysicalProofOptions) {
  if (opts.listPanesText !== undefined && opts.listPanesText !== null) {
    return { ok: true, stdout: opts.listPanesText, stderr: '', unavailable_reason: null }
  }
  try {
    const result = await runProcess('tmux', ['list-panes', '-a', '-F', '#{session_name}\t#{window_index}\t#{pane_index}\t#{pane_id}\t#{pane_dead}\t#{pane_current_command}'], {
      timeoutMs: 3000,
      maxOutputBytes: 128 * 1024
    })
    return {
      ok: result.code === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      unavailable_reason: result.code === 0 ? null : `tmux_list_panes_exit_${result.code}`
    }
  } catch (err: unknown) {
    return { ok: false, stdout: '', stderr: err instanceof Error ? err.message : String(err), unavailable_reason: 'tmux_list_panes_unavailable' }
  }
}

function unavailableListPanes(reason: string) {
  return { ok: false, stdout: '', stderr: '', unavailable_reason: reason }
}

async function captureLane(root: string, lane: any, scheduler: any, listPanes: TmuxListPaneRow[], opts: TmuxPhysicalProofOptions, phase: string, realTmux: boolean): Promise<LaneCapture> {
  const slotId = String(lane?.slot_id || '')
  const paneId = String(lane?.pane_id || '')
  const listed = listPanes.some((row) => row.pane_id === paneId)
  const relArtifact = `agent-tmux-capture-${slotId || 'unknown'}.txt`
  const artifact = path.join(root, relArtifact)
  let capture = opts.captureByPaneId?.[paneId] || ''
  if (realTmux && listed && !capture) {
    try {
      const result = await runProcess('tmux', ['capture-pane', '-p', '-t', paneId], { timeoutMs: 3000, maxOutputBytes: 64 * 1024 })
      capture = result.stdout
    } catch (err: unknown) {
      capture = ''
    }
  }
  if (capture) await writeTextAtomic(artifact, redactLocalText(capture).slice(-24 * 1024))
  const laneMd = await readText(path.join(root, String(lane?.lane_md || '')), '')
  const expectedGeneration = lane?.current_generation_index === null || lane?.current_generation_index === undefined
    ? '(idle|drained)'
    : escapeRegExp(String(lane.current_generation_index))
  const generationRe = new RegExp(`(?:generation:\\s*(?:${expectedGeneration})|gen(?:eration)?[-_ ]?${expectedGeneration})`, 'i')
  const slotPresent = capture.includes(slotId)
  const generationPresent = generationRe.test(capture) || /session:\s*(?:idle|drained)/i.test(capture)
  const queuePresent = /queue:|pending|backfill|completed/i.test(capture)
  const staleContent = Boolean(capture && laneMd && !capture.includes(String(lane?.pane_id || '')) && !capture.includes(slotId))
  const blockers = [
    ...(realTmux && phase !== 'after_drain' && !capture ? ['tmux_capture_pane_missing'] : []),
    ...(realTmux && phase !== 'after_drain' && capture && !slotPresent ? ['tmux_capture_slot_id_missing'] : []),
    ...(realTmux && phase !== 'after_drain' && capture && !generationPresent ? ['tmux_capture_generation_or_status_missing'] : []),
    ...(realTmux && phase !== 'after_drain' && capture && !queuePresent ? ['tmux_capture_queue_summary_missing'] : []),
    ...(realTmux && staleContent ? ['tmux_capture_stale_content'] : []),
    ...(scheduler && lane?.current_generation_index !== null && lane?.current_generation_index !== undefined && !String(laneMd).includes(String(lane.current_generation_index)) ? ['lane_md_scheduler_generation_mismatch'] : [])
  ]
  return {
    slot_id: slotId,
    pane_id: paneId,
    artifact: capture ? relArtifact : null,
    capture_available: Boolean(capture),
    slot_id_present: slotPresent,
    generation_or_status_present: generationPresent,
    queue_summary_present: queuePresent,
    stale_content: staleContent,
    blockers
  }
}

function parseLaunchLedger(text: string) {
  const out = new Map<string, string>()
  for (const line of String(text || '').split(/\r?\n/).filter(Boolean)) {
    try {
      const row = JSON.parse(line)
      if (row.slot_id && row.pane_id) out.set(String(row.slot_id), String(row.pane_id))
    } catch {}
  }
  return out
}

function validTmuxPaneId(value: string) {
  return /^%\d+$/.test(value)
}

function redactLocalText(text: string) {
  return String(text || '')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[redacted-openai-key]')
    .replace(/github_pat_[A-Za-z0-9_]{12,}/g, '[redacted-github-token]')
    .replace(/CODEX_ACCESS_TOKEN=[^\s]+/g, 'CODEX_ACCESS_TOKEN=[redacted]')
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function tmuxPhysicalProofArtifactsExist(root: string) {
  return {
    physical_proof: await exists(path.join(root, 'agent-tmux-physical-proof.json')),
    list_panes: await exists(path.join(root, 'agent-tmux-list-panes.json')),
    reconciliation: await exists(path.join(root, 'agent-tmux-pane-reconciliation.json')),
    lane_content_truth: await exists(path.join(root, 'agent-tmux-lane-content-truth.json'))
  }
}
