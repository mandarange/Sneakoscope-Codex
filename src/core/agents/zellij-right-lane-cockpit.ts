import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'

export const ZELLIJ_RIGHT_LANE_LAYOUT_SCHEMA = 'sks.agent-zellij-right-lane-layout.v1'
export const ZELLIJ_RIGHT_LANES_SCHEMA = 'sks.agent-zellij-right-lanes.v1'

export function buildZellijRightLaneCockpit(input: {
  missionId?: string
  sessionName?: string
  agents?: any[]
  slots?: any[]
  maxVisibleLanes?: number
} = {}) {
  const agents = input.slots || input.agents || []
  const maxVisible = input.maxVisibleLanes || Math.max(agents.length, 1)
  const lanes = agents.map((agent, index) => ({
    lane_index: index + 1,
    slot_id: String(agent.slot_id || agent.id || agent.agent_id || `slot-${String(index + 1).padStart(3, '0')}`),
    agent_id: String(agent.id || agent.agent_id || `agent_${index + 1}`),
    persona: String(agent.persona || agent.persona_id || agent.role || 'agent'),
    task: String(agent.task || agent.task_slice_id || agent.role || 'assigned slice'),
    status: String(agent.status || 'pending'),
    current_session_id: agent.current_session_id || agent.session_id || null,
    generation_index: agent.current_generation_index || agent.generation_index || null,
    generation_count: agent.generation_count || (Array.isArray(agent.history) ? agent.history.length : 0),
    pane_id: agent.pane_id || agent.current_pane_id || null,
    launch_status: agent.launch_status || (agent.pane_id || agent.current_pane_id ? 'launched' : 'pending'),
    history: Array.isArray(agent.history) ? agent.history.slice(-5) : [],
    title: `${String(agent.slot_id || index + 1)} gen-${String(agent.current_generation_index || agent.generation_index || '-')}`.trim(),
    heartbeat_age_ms: agent.heartbeat_age_ms ?? null,
    transcript_tail: String(agent.transcript_tail || '').slice(-4000),
    closed_marker: ['closed', 'done', 'completed'].includes(String(agent.status || '')) ? 'closed' : null,
    blocker_marker: Array.isArray(agent.blockers) && agent.blockers.length ? 'blocked' : null
  }))
  const pageCount = Math.max(1, Math.ceil(lanes.length / maxVisible))
  const layout = {
    schema: ZELLIJ_RIGHT_LANE_LAYOUT_SCHEMA,
    generated_at: nowIso(),
    mission_id: input.missionId || null,
    session_name: input.sessionName || null,
    orchestrator_pane: 'left',
    agent_lane_stack: 'right_vertical',
    agent_count: lanes.length,
    visible_lane_count: Math.min(lanes.length, maxVisible),
    page_count: pageCount,
    actual_pane_ids: lanes.map((lane) => lane.pane_id).filter(Boolean),
    attach_command: input.sessionName ? `zellij attach ${input.sessionName}` : 'sks zellij status',
    keyboard_hint: 'Use the Zellij pane controls to move between lanes; detach with the configured Zellij detach binding.',
    cleanup_command_hint: 'Use native Zellij session controls; legacy Team mutation commands are removed.',
    ok: lanes.length > 0
  }
  const laneManifest = {
    schema: ZELLIJ_RIGHT_LANES_SCHEMA,
    generated_at: layout.generated_at,
    mission_id: layout.mission_id,
    lane_count: lanes.length,
    lanes,
    actual_pane_ids: lanes.map((lane) => lane.pane_id).filter(Boolean),
    pane_launch_evidence_required: true,
    pagination: {
      max_visible_lanes: maxVisible,
      page_count: pageCount,
      all_agents_indexed: lanes.length === agents.length
    },
    ok: lanes.length > 0
  }
  return { layout, lanes: laneManifest }
}

export async function writeZellijRightLaneCockpit(root: string, input: { missionId?: string; sessionName?: string; agents?: any[]; slots?: any[] } = {}) {
  const cockpit = buildZellijRightLaneCockpit(input)
  await writeJsonAtomic(path.join(root, 'agent-zellij-layout.json'), cockpit.layout)
  await writeJsonAtomic(path.join(root, 'agent-zellij-lanes.json'), cockpit.lanes)
  return cockpit
}
