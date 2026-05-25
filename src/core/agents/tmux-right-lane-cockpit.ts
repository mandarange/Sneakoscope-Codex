import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'

export const TMUX_RIGHT_LANE_LAYOUT_SCHEMA = 'sks.agent-tmux-right-lane-layout.v1'
export const TMUX_RIGHT_LANES_SCHEMA = 'sks.agent-tmux-right-lanes.v1'

export function buildTmuxRightLaneCockpit(input: {
  missionId?: string
  sessionName?: string
  agents?: any[]
  maxVisibleLanes?: number
} = {}) {
  const agents = input.agents || []
  const maxVisible = input.maxVisibleLanes || 20
  const lanes = agents.map((agent, index) => ({
    lane_index: index + 1,
    agent_id: String(agent.id || agent.agent_id || `agent_${index + 1}`),
    persona: String(agent.persona || agent.persona_id || agent.role || 'agent'),
    task: String(agent.task || agent.task_slice_id || agent.role || 'assigned slice'),
    status: String(agent.status || 'pending'),
    title: `${index + 1}. ${String(agent.id || agent.agent_id || `agent_${index + 1}`)} ${String(agent.role || '').trim()}`.trim(),
    heartbeat_age_ms: agent.heartbeat_age_ms ?? null,
    transcript_tail: String(agent.transcript_tail || '').slice(-4000),
    closed_marker: ['closed', 'done', 'completed'].includes(String(agent.status || '')) ? 'closed' : null,
    blocker_marker: Array.isArray(agent.blockers) && agent.blockers.length ? 'blocked' : null
  }))
  const pageCount = Math.max(1, Math.ceil(lanes.length / maxVisible))
  const layout = {
    schema: TMUX_RIGHT_LANE_LAYOUT_SCHEMA,
    generated_at: nowIso(),
    mission_id: input.missionId || null,
    session_name: input.sessionName || null,
    orchestrator_pane: 'left',
    agent_lane_stack: 'right_vertical',
    agent_count: lanes.length,
    visible_lane_count: Math.min(lanes.length, maxVisible),
    page_count: pageCount,
    attach_command: input.sessionName ? `tmux attach -t ${input.sessionName}` : 'sks team open-tmux latest',
    keyboard_hint: 'Use tmux prefix + arrow keys to move panes; detach with prefix + d.',
    cleanup_command_hint: 'sks team cleanup-tmux latest',
    ok: lanes.length > 0
  }
  const laneManifest = {
    schema: TMUX_RIGHT_LANES_SCHEMA,
    generated_at: layout.generated_at,
    mission_id: layout.mission_id,
    lane_count: lanes.length,
    lanes,
    pagination: {
      max_visible_lanes: maxVisible,
      page_count: pageCount,
      all_agents_indexed: lanes.length === agents.length
    },
    ok: lanes.length > 0
  }
  return { layout, lanes: laneManifest }
}

export async function writeTmuxRightLaneCockpit(root: string, input: { missionId?: string; sessionName?: string; agents?: any[] } = {}) {
  const cockpit = buildTmuxRightLaneCockpit(input)
  await writeJsonAtomic(path.join(root, 'agent-tmux-layout.json'), cockpit.layout)
  await writeJsonAtomic(path.join(root, 'agent-tmux-lanes.json'), cockpit.lanes)
  return cockpit
}
