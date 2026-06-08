import { nowIso } from '../fsx.js'

export const ZELLIJ_DASHBOARD_RENDER_SCHEMA = 'sks.zellij-dashboard-render.v1'

export interface ZellijDashboardSnapshot {
  schema: typeof ZELLIJ_DASHBOARD_RENDER_SCHEMA
  generated_at: string
  mission_id: string
  mode: string
  route: string
  provider: string
  service_tier: string
  backpressure: string
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
  update_notice?: {
    update_available: boolean
    latest_version: string | null
    source: string
    message?: string
  } | null
  patch_verify: {
    patches: number
    gpt_approved: number
    conflicts: number
    verification_running: number
    verification_passed: number
    verification_failed: number
  }
  workers: Array<{
    slot_id: string
    generation_index: number
    role: string
    backend: string
    provider: string
    service_tier: string
    worktree_id: string | null
    branch: string | null
    status: string
    current_task: string
    current_file: string | null
    latest_heartbeat: string | null
  }>
  latest_blockers: string[]
}

export function buildZellijDashboardSnapshot(input: Partial<ZellijDashboardSnapshot> & { mission_id: string }): ZellijDashboardSnapshot {
  return {
    schema: ZELLIJ_DASHBOARD_RENDER_SCHEMA,
    generated_at: nowIso(),
    mission_id: input.mission_id,
    mode: input.mode || 'naruto',
    route: input.route || input.mode || '$Naruto',
    provider: input.provider || 'unknown',
    service_tier: input.service_tier || 'fast',
    backpressure: input.backpressure || 'normal',
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
    update_notice: input.update_notice || null,
    patch_verify: input.patch_verify || {
      patches: 0,
      gpt_approved: 0,
      conflicts: 0,
      verification_running: 0,
      verification_passed: 0,
      verification_failed: 0
    },
    workers: input.workers || [],
    latest_blockers: input.latest_blockers || []
  }
}

export function renderZellijDashboardText(snapshot: ZellijDashboardSnapshot): string {
  const backendCounts = Object.entries(snapshot.backend_counts).map(([key, value]) => `${key}=${value}`).join(' ')
  const placementCounts = Object.entries(snapshot.placement_counts).map(([key, value]) => `${key}=${value}`).join(' ')
  return [
    'SKS Dashboard',
    `Mission: ${snapshot.mission_id}`,
    `Route / mode: ${snapshot.route} / ${snapshot.mode} / ${snapshot.service_tier}`,
    `Provider: ${snapshot.provider}`,
    `Backend counts: ${backendCounts || 'none'}`,
    `Placement counts: ${placementCounts || 'none'}`,
    `Active / visible / headless / queued: ${snapshot.active_workers}/${snapshot.visible_panes}/${snapshot.headless_workers}/${snapshot.queue_depth}`,
    `Backpressure: ${snapshot.backpressure}`,
    `Worktrees active/completed/retained: ${snapshot.worktrees.active}/${snapshot.worktrees.completed}/${snapshot.worktrees.retained}`,
    `Local LLM TPS / queue: ${snapshot.local_llm.tps}/${snapshot.local_llm.queue}`,
    `GPT final status: ${snapshot.gpt_final_status}`,
    `Gate progress: ${snapshot.gate_progress}`,
    `Update notice: ${snapshot.update_notice?.update_available ? `${snapshot.update_notice.latest_version || 'available'} available` : (snapshot.update_notice ? `none (${snapshot.update_notice.source})` : 'not checked')}`,
    `Patch / verify: patches ${snapshot.patch_verify.patches} · approved ${snapshot.patch_verify.gpt_approved} · conflicts ${snapshot.patch_verify.conflicts} · verify ${snapshot.patch_verify.verification_running}/${snapshot.patch_verify.verification_passed}/${snapshot.patch_verify.verification_failed}`,
    'Workers:',
    ...(snapshot.workers.length ? snapshot.workers.slice(0, 12).map((worker) => `${worker.slot_id} gen-${worker.generation_index} ${worker.role} ${worker.backend}/${worker.provider}/${worker.service_tier} WT:${worker.worktree_id || '-'} ${worker.status} ${worker.current_file || ''} ${worker.latest_heartbeat || ''}`) : ['none']),
    `Latest blockers: ${snapshot.latest_blockers.length ? snapshot.latest_blockers.join(', ') : 'none'}`,
    'Controls: q detach | /stop selected | /focus slot | /logs'
  ].join('\n')
}
