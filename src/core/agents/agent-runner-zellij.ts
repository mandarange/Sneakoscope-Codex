import path from 'node:path'
import { appendJsonl, readJson, writeJsonAtomic } from '../fsx.js'
import { validateAgentWorkerResult } from './agent-worker-pipeline.js'
import { buildFixturePatchEnvelopes } from './agent-runner-fake.js'
import { fastModeEnv, resolveFastModePolicy } from './fast-mode-policy.js'

export function buildZellijAgentPanePlan(agent: any, slice: any = {}) {
  const agentId = String(agent?.id || 'agent')
  const sliceId = String(slice?.id || 'slice')
  return {
    schema: 'sks.agent-zellij-pane-plan.v1',
    overview_pane: {
      title: 'overview: native_agent_orchestrator',
      command: 'sks agent status latest --json && parent-owned team watch latest'
    },
    agent_pane: {
      title: `agent: ${agentId}`,
      command: `sks zellij-lane --mission latest --slot ${agent.slot_id || agentId} --ledger-root agents --follow # ${sliceId}`,
      self_close: false,
      persistent_worker_slot: true
    }
  }
}

export async function runZellijAgent(agent: any, slice: any, opts: any = {}) {
  const fastPolicy = resolveFastModePolicy({ fastMode: opts.fastMode ?? agent.fast_mode, serviceTier: opts.serviceTier ?? agent.service_tier })
  const plan = buildZellijAgentPanePlan(agent, slice)
  const launch = await recordZellijPane(agent, slice, opts)
  const patchEnvelopes = buildFixturePatchEnvelopes(agent, slice, opts)
  const artifact = await writeAgentZellijReport(opts.agentRoot || opts.cwd || process.cwd(), agent, {
    plan,
    overview_pane_created: true,
    self_closing_panes: false,
    persistent_worker_slot: true,
    launch_mode: launch.launch_mode,
    pane_id: launch.pane_id,
    session_name: launch.session_name,
    command: launch.command,
    service_tier: fastPolicy.service_tier,
    fast_mode: fastPolicy.fast_mode,
    env: fastModeEnv(fastPolicy),
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
    backend: 'zellij',
    summary: 'Zellij lane evidence recorded for ' + (slice?.id || agent.id) + '.',
    findings: ['Zellij lane pane evidence recorded'],
    proposed_changes: [],
    changed_files: [],
    lease_compliance: { ok: true, violations: [] },
    artifacts: [artifact],
    blockers: launch.blockers,
    confidence: launch.launch_mode === 'real_zellij' ? 'verified_partial' : 'fixture',
    handoff_notes: launch.launch_mode === 'real_zellij' ? 'Zellij pane was launched.' : 'Zellij lane artifact was recorded without requiring a live terminal.',
    unverified: [],
    writes: [],
    ...(patchEnvelopes.length ? { patch_envelopes: patchEnvelopes } : {}),
    source_intelligence_refs: agent.source_intelligence_refs || null,
    goal_mode_ref: agent.goal_mode_ref || null,
    verification: { status: launch.blockers.length ? 'failed' : 'passed', checks: ['zellij-pane-launch-ledger'] },
    recursion_guard: { ok: true, violations: [] }
  })
}

async function writeAgentZellijReport(root: string, agent: any, report: any) {
  const rel = path.join(agent.session_artifact_dir || path.join('sessions', agent.id), 'agent-zellij-report.json')
  await writeJsonAtomic(path.join(root, rel), { schema: 'sks.agent-zellij-report.v1', backend: 'zellij', agent_id: agent.id, session_id: agent.session_id, service_tier: report.service_tier || agent.service_tier || 'fast', fast_mode: report.fast_mode !== false, ...report })
  return rel
}

async function recordZellijPane(agent: any, slice: any, opts: any = {}) {
  const root = opts.agentRoot || opts.cwd || process.cwd()
  const sessionName = opts.zellijSessionName || (opts.missionId ? `sks-${opts.missionId}` : 'sks-agent-runtime')
  const supervisorEvidence = await recordSupervisorLaneEvidence(root, agent, slice, sessionName)
  if (supervisorEvidence) return supervisorEvidence
  const slotId = String(agent.slot_id || agent.id)
  const command = `sks zellij-lane --mission ${opts.missionId || 'latest'} --slot ${slotId} --ledger-root ${root} --follow`
  const evidence = {
    schema: 'sks.agent-zellij-pane-launch.v1',
    generated_at: new Date().toISOString(),
    launch_mode: opts.real === true ? 'real_zellij_unavailable_without_layout' : 'zellij_layout_artifact',
    agent_id: agent.id,
    slot_id: slotId,
    generation_index: agent.generation_index || 1,
    session_id: agent.session_id,
    session_name: sessionName,
    pane_id: `zellij-pane-${slotId}`,
    command,
    attach_command: `zellij attach ${sessionName}`,
    blockers: opts.real === true ? ['zellij_real_launch_requires_session_layout'] : [],
    warnings: opts.real === true ? [] : ['zellij_artifact_mode']
  }
  await appendJsonl(path.join(root, 'agent-zellij-pane-launch-ledger.jsonl'), evidence)
  return evidence
}

async function recordSupervisorLaneEvidence(root: string, agent: any, slice: any, sessionName: string) {
  const supervisor = await readJson<any>(path.join(root, 'agent-zellij-lane-supervisor.json'), null)
  const slotId = String(agent.slot_id || agent.id)
  const lane = supervisor?.lanes?.find((row: any) => String(row.slot_id) === slotId)
  if (!lane?.pane_id) return null
  const evidence = {
    schema: 'sks.agent-zellij-pane-launch.v1',
    generated_at: new Date().toISOString(),
    launch_mode: lane.launch_mode || 'zellij_supervisor_slot_lane',
    agent_id: agent.id,
    slot_id: slotId,
    generation_index: agent.generation_index || 1,
    session_id: agent.session_id,
    session_name: supervisor.session_name || sessionName,
    pane_id: lane.pane_id,
    command: lane.command,
    attach_command: `zellij attach ${supervisor.session_name || sessionName}`,
    persistent_slot_lane: true,
    reused_persistent_slot_lane: true,
    work_item_id: slice?.id || null,
    blockers: lane.launch_error ? [`zellij_lane_launch_error:${lane.launch_error}`] : []
  }
  await appendJsonl(path.join(root, 'agent-zellij-pane-launch-ledger.jsonl'), evidence)
  return evidence
}
