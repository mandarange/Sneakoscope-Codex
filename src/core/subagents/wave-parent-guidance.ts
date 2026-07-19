import type { SubagentWaveLifecycle } from './wave-lifecycle.js'

export const WAVE_PARENT_GUIDANCE_SCHEMA = 'sks.subagent-wave-parent-guidance.v1'

export interface WaveParentGuidance {
  schema: typeof WAVE_PARENT_GUIDANCE_SCHEMA
  required: boolean
  actions: string[]
  remaining_to_start: number
  open_threads: number
  recovered_capacity: number
  post_wave_rescan_required: boolean
  current_wave: number
  completed_waves: number
}

export function buildWaveParentGuidance(
  lifecycle: Partial<SubagentWaveLifecycle> | null | undefined
): WaveParentGuidance {
  const remaining = Math.max(0, Math.floor(Number(lifecycle?.remaining_to_start || 0)))
  const openThreads = Math.max(0, Math.floor(Number(lifecycle?.open_threads || 0)))
  const recovered = Math.max(0, Math.floor(Number(lifecycle?.recovered_capacity || 0)))
  const rescan = lifecycle?.post_wave_rescan_required === true
  const actions: string[] = []

  if (openThreads > 0) {
    actions.push('close_completed_child_threads_after_collecting_results')
  }
  if (rescan || remaining > 0) {
    actions.push('refresh_wave_lifecycle_and_ready_dag')
    actions.push(`spawn_next_direct_child_wave_upto:${Math.max(1, Math.min(remaining || recovered, recovered || remaining || 1))}`)
  }
  if (remaining === 0 && openThreads === 0 && !rescan) {
    actions.push('integrate_settled_child_results_and_emit_parent_summary')
  }

  return {
    schema: WAVE_PARENT_GUIDANCE_SCHEMA,
    required: actions.some((action) => action.startsWith('spawn_next_') || action.startsWith('close_')),
    actions: [...new Set(actions)],
    remaining_to_start: remaining,
    open_threads: openThreads,
    recovered_capacity: recovered,
    post_wave_rescan_required: rescan,
    current_wave: Math.max(0, Math.floor(Number(lifecycle?.current_wave || 0))),
    completed_waves: Math.max(0, Math.floor(Number(lifecycle?.completed_waves || 0)))
  }
}

export function renderWaveParentGuidance(guidance: WaveParentGuidance): string {
  if (!guidance.required && guidance.actions.length === 0) return ''
  return [
    'SKS Naruto wave lifecycle (root parent only):',
    `- current_wave=${guidance.current_wave}; completed_waves=${guidance.completed_waves}`,
    `- open_threads=${guidance.open_threads}; remaining_to_start=${guidance.remaining_to_start}; recovered_capacity=${guidance.recovered_capacity}`,
    `- post_wave_rescan_required=${guidance.post_wave_rescan_required}`,
    ...guidance.actions.map((action) => `- action: ${action}`),
    '- max_depth=1: children must not spawn children; only this root may launch later direct-child waves',
    '- after collecting results, close completed child threads so recovered capacity can be reused'
  ].join('\n')
}
