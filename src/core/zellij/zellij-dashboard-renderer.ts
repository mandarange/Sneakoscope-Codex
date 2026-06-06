import { nowIso } from '../fsx.js'

export const ZELLIJ_DASHBOARD_RENDER_SCHEMA = 'sks.zellij-dashboard-render.v1'

export interface ZellijDashboardSnapshot {
  schema: typeof ZELLIJ_DASHBOARD_RENDER_SCHEMA
  generated_at: string
  mission_id: string
  mode: string
  backend_counts: Record<string, number>
  placement_counts: Record<string, number>
  active_workers: number
  visible_panes: number
  headless_workers: number
  queue_depth: number
  worktrees: {
    active: number
    completed: number
    retained: number
  }
  local_llm: {
    tps: number
    queue: number
  }
  gpt_final_status: string
  gate_progress: string
  latest_blockers: string[]
}

export function buildZellijDashboardSnapshot(input: Partial<ZellijDashboardSnapshot> & { mission_id: string }): ZellijDashboardSnapshot {
  return {
    schema: ZELLIJ_DASHBOARD_RENDER_SCHEMA,
    generated_at: nowIso(),
    mission_id: input.mission_id,
    mode: input.mode || 'naruto',
    backend_counts: input.backend_counts || { 'codex-sdk': 1 },
    placement_counts: input.placement_counts || { 'zellij-pane': 1 },
    active_workers: Number(input.active_workers || 0),
    visible_panes: Number(input.visible_panes || 0),
    headless_workers: Number(input.headless_workers || 0),
    queue_depth: Number(input.queue_depth || 0),
    worktrees: input.worktrees || { active: 0, completed: 0, retained: 0 },
    local_llm: input.local_llm || { tps: 0, queue: 0 },
    gpt_final_status: input.gpt_final_status || 'not_started',
    gate_progress: input.gate_progress || 'not_release',
    latest_blockers: input.latest_blockers || []
  }
}

export function renderZellijDashboardText(snapshot: ZellijDashboardSnapshot): string {
  const backendCounts = Object.entries(snapshot.backend_counts).map(([key, value]) => `${key}=${value}`).join(' ')
  const placementCounts = Object.entries(snapshot.placement_counts).map(([key, value]) => `${key}=${value}`).join(' ')
  return [
    'SKS Dashboard',
    `Mission: ${snapshot.mission_id}`,
    `Mode: ${snapshot.mode}`,
    `Backend counts: ${backendCounts || 'none'}`,
    `Placement counts: ${placementCounts || 'none'}`,
    `Active workers: ${snapshot.active_workers}`,
    `Visible panes: ${snapshot.visible_panes}`,
    `Headless workers: ${snapshot.headless_workers}`,
    `Queue depth: ${snapshot.queue_depth}`,
    `Worktrees active/completed/retained: ${snapshot.worktrees.active}/${snapshot.worktrees.completed}/${snapshot.worktrees.retained}`,
    `Local LLM TPS / queue: ${snapshot.local_llm.tps}/${snapshot.local_llm.queue}`,
    `GPT final status: ${snapshot.gpt_final_status}`,
    `Gate progress: ${snapshot.gate_progress}`,
    `Latest blockers: ${snapshot.latest_blockers.length ? snapshot.latest_blockers.join(', ') : 'none'}`
  ].join('\n')
}
