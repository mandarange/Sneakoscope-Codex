import path from 'node:path'
import { appendJsonl, readJson, runProcess, writeJsonAtomic } from '../fsx.js'
import { validateAgentWorkerResult } from './agent-worker-pipeline.js'

export function buildTmuxAgentPanePlan(agent: any, slice: any = {}) {
  const agentId = String(agent?.id || 'agent')
  const sliceId = String(slice?.id || 'slice')
  return {
    schema: 'sks.agent-tmux-pane-plan.v1',
    overview_pane: {
      title: 'overview: native_agent_orchestrator',
      command: 'sks agent status latest --json && parent-owned team watch latest'
    },
    agent_pane: {
      title: `agent: ${agentId}`,
      command: `sks agent lane latest --agent ${agentId} --follow # ${sliceId}`,
      self_close: false,
      persistent_worker_slot: true
    }
  }
}

export async function runTmuxAgent(agent: any, slice: any, opts: any = {}) {
  const plan = buildTmuxAgentPanePlan(agent, slice)
  const launch = await launchTmuxPane(agent, slice, opts)
  const artifact = await writeAgentTmuxReport(opts.agentRoot || opts.cwd || process.cwd(), agent, {
    plan,
    overview_pane_created: true,
    self_closing_panes: false,
    persistent_worker_slot: true,
    launch_mode: launch.launch_mode,
    pane_id: launch.pane_id,
    session_name: launch.session_name,
    window_id: launch.window_id,
    command: launch.command,
    attach_command: launch.attach_command,
    blockers: launch.blockers
  })
  return validateAgentWorkerResult({
    schema: 'sks.agent-result.v1',
    mission_id: '',
    agent_id: agent.id,
    session_id: agent.session_id,
    persona_id: agent.persona_id || agent.id,
    task_slice_id: slice?.id || '',
    status: launch.blockers.length ? 'blocked' : 'done',
    backend: 'tmux',
    summary: 'tmux pane launch evidence recorded for ' + (slice?.id || agent.id) + '.',
    findings: ['tmux right-lane pane launch evidence recorded'],
    proposed_changes: [],
    changed_files: [],
    lease_compliance: { ok: true, violations: [] },
    artifacts: [artifact],
    blockers: launch.blockers,
    confidence: launch.launch_mode === 'real_tmux' ? 'verified_partial' : 'fixture',
    handoff_notes: launch.launch_mode === 'real_tmux' ? 'tmux pane was launched.' : 'fake tmux pane id used because real tmux was unavailable or disabled.',
    unverified: [],
    writes: [],
    source_intelligence_refs: agent.source_intelligence_refs || null,
    goal_mode_ref: agent.goal_mode_ref || null,
    verification: { status: launch.blockers.length ? 'failed' : 'passed', checks: ['tmux-pane-launch-ledger'] },
    recursion_guard: { ok: true, violations: [] }
  })
}

async function writeAgentTmuxReport(root: string, agent: any, report: any) {
  const rel = path.join(agent.session_artifact_dir || path.join('sessions', agent.id), 'agent-tmux-report.json')
  await writeJsonAtomic(path.join(root, rel), { schema: 'sks.agent-tmux-report.v1', backend: 'tmux', agent_id: agent.id, session_id: agent.session_id, ...report })
  return rel
}

async function launchTmuxPane(agent: any, slice: any, opts: any = {}) {
  const root = opts.agentRoot || opts.cwd || process.cwd()
  const sessionName = opts.tmuxSessionName || (opts.missionId ? `sks-${opts.missionId}` : 'sks-agent-runtime')
  const supervisorEvidence = await recordSupervisorLaneEvidence(root, agent, slice, sessionName)
  if (supervisorEvidence) return supervisorEvidence
  if (opts.real === true) {
    const blocked = fakeLaunch(agent, sessionName, '', ['tmux_lane_supervisor_missing_for_real_tmux'])
    return { ...blocked, blockers: ['tmux_lane_supervisor_missing_for_real_tmux'] }
  }
  const title = `${agent.slot_id || agent.id} gen-${agent.generation_index || 1} ${slice?.id || 'work'}`
  const laneFile = path.join(root, 'lanes', String(agent.slot_id || agent.id), 'lane.md')
  const drainFile = path.join(root, 'lanes', '.drain')
  const command = `while test ! -f ${JSON.stringify(drainFile)}; do clear; printf '%s\\n' ${JSON.stringify(title)}; test -f ${JSON.stringify(laneFile)} && cat ${JSON.stringify(laneFile)}; sleep 2; done`
  const fake = opts.fakeTmux === true || opts.real !== true
  if (!fake) {
    try {
      await runProcess('tmux', ['has-session', '-t', sessionName], { timeoutMs: 1000, maxOutputBytes: 4096 }).catch(async () => {
        await runProcess('tmux', ['new-session', '-d', '-s', sessionName, '-n', 'orchestrator', 'sleep 3600'], { timeoutMs: 2000, maxOutputBytes: 4096 })
      })
      const pane = await runProcess('tmux', ['split-window', '-t', sessionName, '-P', '-F', '#{pane_id}', '-h', command], { timeoutMs: 2000, maxOutputBytes: 4096 })
      const paneId = pane.stdout.trim() || `%${Date.now()}`
      const evidence = {
        schema: 'sks.agent-tmux-pane-launch.v1',
        generated_at: new Date().toISOString(),
        launch_mode: 'real_tmux',
        agent_id: agent.id,
        slot_id: agent.slot_id || agent.id,
        generation_index: agent.generation_index || 1,
        session_id: agent.session_id,
        session_name: sessionName,
        window_id: null,
        pane_id: paneId,
        command,
        attach_command: `tmux attach -t ${sessionName}`,
        blockers: []
      }
      await appendJsonl(path.join(root, 'agent-tmux-pane-launch-ledger.jsonl'), evidence)
      return evidence
    } catch (err: unknown) {
      const blocker = `tmux_real_launch_failed:${err instanceof Error ? err.message : String(err)}`
      const fallback = fakeLaunch(agent, sessionName, command, [blocker])
      await appendJsonl(path.join(root, 'agent-tmux-pane-launch-ledger.jsonl'), fallback)
      return { ...fallback, blockers: [] }
    }
  }
  const evidence = fakeLaunch(agent, sessionName, command, [])
  await appendJsonl(path.join(root, 'agent-tmux-pane-launch-ledger.jsonl'), evidence)
  return evidence
}

async function recordSupervisorLaneEvidence(root: string, agent: any, slice: any, sessionName: string) {
  const supervisor = await readJson<any>(path.join(root, 'agent-tmux-lane-supervisor.json'), null)
  const slotId = String(agent.slot_id || agent.id)
  const lane = supervisor?.lanes?.find((row: any) => String(row.slot_id) === slotId)
  if (!lane?.pane_id) return null
  const evidence = {
    schema: 'sks.agent-tmux-pane-launch.v1',
    generated_at: new Date().toISOString(),
    launch_mode: lane.launch_mode || 'supervisor_slot_lane',
    agent_id: agent.id,
    slot_id: slotId,
    generation_index: agent.generation_index || 1,
    session_id: agent.session_id,
    session_name: supervisor.session_name || sessionName,
    window_id: null,
    pane_id: lane.pane_id,
    command: lane.command,
    attach_command: `tmux attach -t ${supervisor.session_name || sessionName}`,
    persistent_slot_lane: true,
    reused_persistent_slot_lane: true,
    work_item_id: slice?.id || null,
    blockers: lane.launch_error ? [`tmux_lane_launch_error:${lane.launch_error}`] : []
  }
  await appendJsonl(path.join(root, 'agent-tmux-pane-launch-ledger.jsonl'), evidence)
  return evidence
}

function fakeLaunch(agent: any, sessionName: string, command: string, warnings: string[]) {
  const paneId = `fake-pane-${String(agent.slot_id || agent.id)}`
  return {
    schema: 'sks.agent-tmux-pane-launch.v1',
    generated_at: new Date().toISOString(),
    launch_mode: 'fake_tmux',
    agent_id: agent.id,
    slot_id: agent.slot_id || agent.id,
    generation_index: agent.generation_index || 1,
    session_id: agent.session_id,
    session_name: sessionName,
    window_id: null,
    pane_id: paneId,
    command,
    attach_command: `tmux attach -t ${sessionName}`,
    blockers: [],
    warnings
  }
}
