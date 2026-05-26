import path from 'node:path'
import { exists, nowIso, readJson, readText, runProcess, writeJsonAtomic, writeTextAtomic } from '../fsx.js'

export const TMUX_PHYSICAL_PROOF_SCHEMA = 'sks.tmux-physical-proof.v2'
export const TMUX_PANE_RECONCILIATION_SCHEMA = 'sks.tmux-pane-reconciliation.v2'
export const TMUX_LANE_CONTENT_TRUTH_SCHEMA = 'sks.tmux-lane-content-truth.v2'

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
  phase?: 'initial' | 'snapshot' | 'before_drain' | 'after_drain' | 'final'
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
    await writeJsonAtomic(path.join(root, phaseProofArtifact(proof.phase)), proof)
    await writeJsonAtomic(path.join(root, 'agent-tmux-pane-reconciliation.json'), proof.reconciliation)
    await writeJsonAtomic(path.join(root, 'agent-tmux-lane-content-truth.json'), proof.lane_content_truth)
    await writeTmuxPhysicalProofSummary(root, proof)
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
  const captureRequired = realTmux && !['after_drain', 'final'].includes(phase)
  const laneContentTruth = {
    schema: TMUX_LANE_CONTENT_TRUTH_SCHEMA,
    generated_at: generatedAt,
    mission_id: opts.missionId || supervisor?.mission_id || null,
    mode,
    phase,
    ok: captures.every((row) => row.blockers.length === 0),
    capture_required: captureRequired,
    captures,
    blockers: captures.flatMap((row) => row.blockers)
  }
  const blockers = [
    ...(!supervisor ? ['tmux_lane_supervisor_missing'] : []),
    ...(realTmux && !listResult.ok && opts.required === true ? ['tmux_list_panes_unavailable'] : []),
    ...(realTmux && listResult.ok && listPanes.length === 0 && !['after_drain', 'final'].includes(phase) ? ['tmux_list_panes_empty'] : []),
    ...(realTmux ? reconciliation.blockers : []),
    ...(realTmux && captureRequired ? laneContentTruth.blockers : [])
  ]
  const integrationOptional = realTmux && !listResult.ok && opts.required !== true
  const physicalVerified = realTmux && !integrationOptional && blockers.length === 0 && listResult.ok
  return {
    schema: TMUX_PHYSICAL_PROOF_SCHEMA,
    generated_at: generatedAt,
    mission_id: opts.missionId || supervisor?.mission_id || null,
    mode,
    phase,
    required: opts.required === true,
    status: integrationOptional ? 'integration_optional' : blockers.length ? 'blocked' : realTmux ? 'passed' : 'fake_fixture',
    ok: integrationOptional || blockers.length === 0,
    physical_tmux_verified: physicalVerified,
    tmux_list_panes_artifact: 'agent-tmux-list-panes.json',
    phase_artifact: phaseProofArtifact(phase),
    phase_specific_artifacts: {
      initial: 'agent-tmux-physical-proof-initial.json',
      before_drain: 'agent-tmux-physical-proof-before-drain.json',
      after_drain: 'agent-tmux-physical-proof-after-drain.json',
      final: 'agent-tmux-physical-proof-final.json',
      summary: 'agent-tmux-physical-proof-summary.json'
    },
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
    const closedPhase = input.phase === 'after_drain' || input.phase === 'final'
    const closedStateRecorded = lane.drained === true && Boolean(lane.closed_at)
    const beforeAliveOk = closedPhase ? true : listed
    const afterClosedOk = closedPhase ? (!listed || closedStateRecorded) : true
    const blockers = [
      ...(input.realTmux && fakePane ? ['fake_tmux_pane_id_in_real_mode'] : []),
      ...(input.realTmux && paneId && !validTmuxPaneId(paneId) ? ['invalid_real_tmux_pane_id'] : []),
      ...(input.realTmux && !closedPhase && !listed ? ['supervisor_pane_missing_from_list_panes'] : []),
      ...(launchPane && launchPane !== paneId ? ['launch_ledger_supervisor_pane_mismatch'] : []),
      ...(manifestPane && manifestPane !== paneId ? ['lane_manifest_supervisor_pane_mismatch'] : []),
      ...(input.realTmux && closedPhase && listed && !closedStateRecorded ? ['drained_pane_still_listed_without_closed_state'] : [])
    ]
    const status = blockers.length ? 'blocked' : input.realTmux ? 'reconciled' : 'fixture_only'
    return {
      slot_id: slotId,
      generation_id: lane.current_generation_index === null || lane.current_generation_index === undefined ? null : String(lane.current_generation_index),
      supervisor_pane_id: paneId,
      launch_ledger_pane_id: launchPane,
      lane_manifest_pane_id: manifestPane,
      list_panes_contains_supervisor_pane: listed,
      fake_pane_id: fakePane,
      before_drain_alive_ok: beforeAliveOk,
      after_drain_closed_ok: afterClosedOk,
      drain_state: input.phase === 'after_drain' || input.phase === 'final' ? (afterClosedOk ? 'closed_or_drained' : 'still_live') : (beforeAliveOk ? 'alive_before_drain' : 'missing_before_drain'),
      status,
      blockers
    }
  })
  const blockers = records.flatMap((row) => row.blockers.map((blocker) => `${blocker}:${row.slot_id}`))
  const genericBlockers = blockers.length ? ['tmux_pane_id_reconciliation_failed'] : []
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
    per_slot_status: records.map((row) => ({ slot_id: row.slot_id, status: row.status, drain_state: row.drain_state, blockers: row.blockers })),
    per_generation_status: records.map((row) => ({ slot_id: row.slot_id, generation_id: row.generation_id, status: row.status })),
    drain_before_state: records.map((row) => ({ slot_id: row.slot_id, alive: row.before_drain_alive_ok })),
    drain_after_state: records.map((row) => ({ slot_id: row.slot_id, closed_or_drained: row.after_drain_closed_ok })),
    records,
    blockers: [...genericBlockers, ...blockers]
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
  const relArtifact = `agent-tmux-capture-${phase.replace(/_/g, '-')}-${slotId || 'unknown'}.txt`
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
  const capturePhaseRequired = !['after_drain', 'final'].includes(phase)
  const blockers = [
    ...(realTmux && capturePhaseRequired && !capture ? ['tmux_capture_pane_missing'] : []),
    ...(realTmux && capturePhaseRequired && capture && !slotPresent ? ['tmux_capture_slot_id_missing'] : []),
    ...(realTmux && capturePhaseRequired && capture && !generationPresent ? ['tmux_capture_generation_or_status_missing'] : []),
    ...(realTmux && capturePhaseRequired && capture && !queuePresent ? ['tmux_capture_queue_summary_missing'] : []),
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
    before_drain: await exists(path.join(root, 'agent-tmux-physical-proof-before-drain.json')),
    after_drain: await exists(path.join(root, 'agent-tmux-physical-proof-after-drain.json')),
    final: await exists(path.join(root, 'agent-tmux-physical-proof-final.json')),
    summary: await exists(path.join(root, 'agent-tmux-physical-proof-summary.json')),
    list_panes: await exists(path.join(root, 'agent-tmux-list-panes.json')),
    reconciliation: await exists(path.join(root, 'agent-tmux-pane-reconciliation.json')),
    lane_content_truth: await exists(path.join(root, 'agent-tmux-lane-content-truth.json'))
  }
}

function phaseProofArtifact(phase: string) {
  if (phase === 'before_drain') return 'agent-tmux-physical-proof-before-drain.json'
  if (phase === 'after_drain') return 'agent-tmux-physical-proof-after-drain.json'
  if (phase === 'final') return 'agent-tmux-physical-proof-final.json'
  if (phase === 'initial') return 'agent-tmux-physical-proof-initial.json'
  return 'agent-tmux-physical-proof-snapshot.json'
}

async function writeTmuxPhysicalProofSummary(root: string, latest: any) {
  const phases = ['initial', 'before_drain', 'after_drain', 'final']
  const phaseReports: Record<string, any> = {}
  for (const phase of phases) {
    phaseReports[phase] = await readJson<any>(path.join(root, phaseProofArtifact(phase)), null)
  }
  phaseReports[String(latest.phase || 'snapshot')] = latest
  const required = latest?.mode === 'real_tmux' && latest?.required === true
  const missing = phases
    .filter((phase) => phase !== 'initial')
    .filter((phase) => !phaseReports[phase])
  const summary = {
    schema: 'sks.tmux-physical-proof-summary.v2',
    generated_at: nowIso(),
    mission_id: latest?.mission_id || null,
    mode: latest?.mode || 'unknown',
    required,
    phases: Object.fromEntries(phases.map((phase) => [phase, phaseReports[phase] ? {
      artifact: phaseProofArtifact(phase),
      status: phaseReports[phase].status,
      ok: phaseReports[phase].ok,
      physical_tmux_verified: phaseReports[phase].physical_tmux_verified === true,
      blockers: phaseReports[phase].blockers || []
    } : null])),
    missing_phase_artifacts: missing,
    ok: missing.length === 0 || latest?.mode !== 'real_tmux',
    blockers: latest?.mode === 'real_tmux' ? missing.map((phase) => `tmux_physical_${phase}_proof_missing`) : []
  }
  await writeJsonAtomic(path.join(root, 'agent-tmux-physical-proof-summary.json'), summary)
  return summary
}
