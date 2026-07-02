import type { NarutoResourcePressure } from './resource-pressure-monitor.js'

export interface NarutoBackpressureDecision {
  schema: 'sks.naruto-backpressure.v1'
  requested_active_workers: number
  adjusted_active_workers: number
  backpressure: 'normal' | 'throttled' | 'saturated'
  reasons: string[]
  cause: string | null
  dashboard_label: string
}

export function applyNarutoBackpressure(requestedActiveWorkers: number, pressure: NarutoResourcePressure): NarutoBackpressureDecision {
  const requested = Math.max(1, Math.floor(requestedActiveWorkers))
  const multiplier = pressure.state === 'saturated' ? 0.25 : pressure.state === 'throttled' ? 0.5 : 1
  const adjusted = Math.max(1, Math.floor(requested * multiplier))
  return {
    schema: 'sks.naruto-backpressure.v1',
    requested_active_workers: requested,
    adjusted_active_workers: adjusted,
    backpressure: pressure.state,
    reasons: pressure.reasons,
    cause: pressure.state === 'normal' ? null : `${pressure.dominant_metric} ${Number(pressure.dominant_pressure || 0).toFixed(2)}`,
    dashboard_label: pressure.state === 'normal'
      ? 'normal'
      : `${pressure.state}: ${pressure.dominant_metric} ${Number(pressure.dominant_pressure || 0).toFixed(2)}`
  }
}
