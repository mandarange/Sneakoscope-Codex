import { probeHardwareCapacity, type HardwareCapacityProbeInput } from './hardware-capacity-probe.js'
import { applyNarutoBackpressure } from './naruto-backpressure.js'
import { monitorNarutoResourcePressure } from './resource-pressure-monitor.js'

export interface NarutoConcurrencyGovernorInput {
  requestedClones?: number
  totalWorkItems?: number
  pendingWorkQueueSize?: number
  activeLeaseConflicts?: number
  backend?: string
  hardware?: HardwareCapacityProbeInput
  zellijVisiblePaneCap?: number
}

export interface NarutoConcurrencyGovernorDecision {
  schema: 'sks.naruto-concurrency-governor.v1'
  requested_clones: number
  total_work_items: number
  safe_active_workers: number
  safe_zellij_visible_panes: number
  headless_workers: number
  local_llm_parallel: number
  remote_codex_parallel: number
  process_parallel: number
  git_worktree_parallel: number
  cpu_io_parallel: number
  verification_parallel: number
  reasons: string[]
  backpressure: 'normal' | 'throttled' | 'saturated'
  hardware: ReturnType<typeof probeHardwareCapacity>
}

export function decideNarutoConcurrency(input: NarutoConcurrencyGovernorInput = {}): NarutoConcurrencyGovernorDecision {
  const requestedClones = normalizePositiveInt(input.requestedClones, 12)
  const totalWorkItems = normalizePositiveInt(input.totalWorkItems, requestedClones)
  const pending = normalizeNonNegativeInt(input.pendingWorkQueueSize, totalWorkItems)
  const leaseConflicts = normalizeNonNegativeInt(input.activeLeaseConflicts, 0)
  const hardware = probeHardwareCapacity(input.hardware || {})
  const zellijVisiblePaneCap = normalizePositiveInt(input.zellijVisiblePaneCap, Math.min(12, Math.max(4, Math.floor(hardware.terminal_rows / 3))))
  const backend = String(input.backend || 'codex-sdk')
  const freeGb = hardware.free_memory_bytes / (1024 * 1024 * 1024)
  const totalGb = hardware.total_memory_bytes / (1024 * 1024 * 1024)
  const reclaimableFloorGb = totalGb >= 32 ? 16 : totalGb >= 16 ? 8 : totalGb >= 8 ? 4 : Math.max(1, freeGb)
  const memoryBudgetGb = Math.max(freeGb, reclaimableFloorGb)
  const heavy = backend === 'codex-sdk' || backend === 'zellij' || backend === 'process' || backend === 'ollama'
  const gbPerWorker = heavy ? Number(process.env.SKS_NARUTO_GB_PER_WORKER || 0.25) : Number(process.env.SKS_NARUTO_LIGHT_GB_PER_WORKER || 0.1)
  const memoryCap = Math.max(1, Math.floor(memoryBudgetGb / Math.max(0.05, gbPerWorker)))
  const fdCap = Math.max(1, Math.floor((hardware.file_descriptor_limit - hardware.process_count) / 6))
  const cpuCap = Math.max(1, hardware.cpu_core_count * (heavy ? 2 : 4))
  const ioCap = Math.max(2, Math.floor(hardware.cpu_core_count / 2))
  const processCap = Math.max(1, Number(process.env.SKS_NARUTO_HEADLESS_PROCESS_CAP || cpuCap + ioCap))
  const gitWorktreeCap = Math.max(1, Number(process.env.SKS_NARUTO_GIT_WORKTREE_CAP || Math.min(requestedClones, processCap)))
  const localLlmParallel = Math.max(1, Math.min(4, hardware.local_llm_max_parallel_requests))
  const remoteCodexParallel = Math.max(1, Math.min(hardware.remote_api_rate_limit_budget, requestedClones))
  const backendBudget = backend === 'ollama' || backend === 'local-llm'
    ? localLlmParallel
    : backend === 'codex-sdk' || backend === 'zellij'
      ? Math.max(remoteCodexParallel, Math.min(requestedClones, processCap))
      : processCap
  const queueCap = Math.max(1, Math.min(requestedClones, pending || totalWorkItems))
  const leaseCap = Math.max(1, requestedClones - leaseConflicts)
  const rawSafe = Math.max(1, Math.min(requestedClones, totalWorkItems, memoryCap, fdCap, cpuCap + ioCap, gitWorktreeCap + processCap, backendBudget, queueCap, leaseCap, 100))
  const pressure = monitorNarutoResourcePressure(hardware, { activeWorkers: rawSafe, zellijVisiblePaneCap })
  const backpressure = applyNarutoBackpressure(rawSafe, pressure)
  const safeActiveWorkers = Math.max(1, Math.min(rawSafe, backpressure.adjusted_active_workers))
  const safeVisible = Math.min(safeActiveWorkers, zellijVisiblePaneCap)
  const reasons = [
    ...(memoryCap < requestedClones ? ['memory_cap'] : []),
    ...(fdCap < requestedClones ? ['file_descriptor_budget'] : []),
    ...(cpuCap + ioCap < requestedClones ? ['cpu_io_budget'] : []),
    ...(gitWorktreeCap + processCap < requestedClones ? ['git_worktree_process_budget'] : []),
    ...(backendBudget < requestedClones ? ['backend_parallel_budget'] : []),
    ...(remoteCodexParallel < requestedClones ? ['remote_api_rate_limit_budget'] : []),
    ...(localLlmParallel <= 4 ? ['local_llm_max_parallel_requests'] : []),
    ...(safeVisible < safeActiveWorkers ? ['zellij_ui_pane_budget'] : []),
    ...(leaseConflicts > 0 ? ['active_lease_conflicts'] : []),
    ...pressure.reasons
  ]
  return {
    schema: 'sks.naruto-concurrency-governor.v1',
    requested_clones: requestedClones,
    total_work_items: totalWorkItems,
    safe_active_workers: safeActiveWorkers,
    safe_zellij_visible_panes: safeVisible,
    headless_workers: Math.max(0, safeActiveWorkers - safeVisible),
    local_llm_parallel: localLlmParallel,
    remote_codex_parallel: remoteCodexParallel,
    process_parallel: processCap,
    git_worktree_parallel: gitWorktreeCap,
    cpu_io_parallel: cpuCap + ioCap,
    verification_parallel: Math.max(1, Math.min(hardware.cpu_core_count * 2, safeActiveWorkers, 16)),
    reasons: [...new Set(reasons)],
    backpressure: backpressure.backpressure,
    hardware
  }
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return Math.max(1, Math.floor(fallback))
  return Math.floor(parsed)
}

function normalizeNonNegativeInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return Math.max(0, Math.floor(fallback))
  return Math.floor(parsed)
}
