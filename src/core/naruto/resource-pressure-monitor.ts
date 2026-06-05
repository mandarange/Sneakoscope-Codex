import type { HardwareCapacityProbe } from './hardware-capacity-probe.js'

export type NarutoBackpressureState = 'normal' | 'throttled' | 'saturated'

export interface NarutoResourcePressure {
  schema: 'sks.naruto-resource-pressure.v1'
  state: NarutoBackpressureState
  memory_pressure: number
  cpu_pressure: number
  fd_pressure: number
  zellij_pressure: number
  disk_io_pressure: number
  reasons: string[]
}

export function monitorNarutoResourcePressure(probe: HardwareCapacityProbe, input: {
  activeWorkers?: number
  zellijVisiblePaneCap?: number
} = {}): NarutoResourcePressure {
  const activeWorkers = Math.max(1, Math.floor(Number(input.activeWorkers || 1)))
  const zellijCap = Math.max(1, Math.floor(Number(input.zellijVisiblePaneCap || 12)))
  const memoryPressure = 1 - (probe.free_memory_bytes / Math.max(1, probe.total_memory_bytes))
  const cpuPressure = Math.min(1, (probe.current_load_average[0] || 0) / Math.max(1, probe.cpu_core_count))
  const fdPressure = Math.min(1, (activeWorkers * 6 + probe.process_count) / Math.max(1, probe.file_descriptor_limit))
  const zellijPressure = Math.min(1, probe.zellij_pane_count / zellijCap)
  const diskIoPressure = probe.disk_io_pressure
  const reasons = [
    ...(memoryPressure > 0.8 ? ['memory_cap'] : []),
    ...(cpuPressure > 0.9 ? ['cpu_load_cap'] : []),
    ...(fdPressure > 0.75 ? ['file_descriptor_budget'] : []),
    ...(zellijPressure > 0.9 ? ['zellij_ui_pane_budget'] : []),
    ...(diskIoPressure > 0.75 ? ['disk_io_pressure'] : [])
  ]
  const maxPressure = Math.max(memoryPressure, cpuPressure, fdPressure, zellijPressure, diskIoPressure)
  const state: NarutoBackpressureState = maxPressure >= 0.92 ? 'saturated' : maxPressure >= 0.72 ? 'throttled' : 'normal'
  return {
    schema: 'sks.naruto-resource-pressure.v1',
    state,
    memory_pressure: round(memoryPressure),
    cpu_pressure: round(cpuPressure),
    fd_pressure: round(fdPressure),
    zellij_pressure: round(zellijPressure),
    disk_io_pressure: round(diskIoPressure),
    reasons
  }
}

function round(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000
}

