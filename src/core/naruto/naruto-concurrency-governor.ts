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
  parallelismMode?: 'extreme' | 'balanced' | 'safe' | string
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
  parallelism_mode: 'extreme' | 'balanced' | 'safe'
  reasons: string[]
  backpressure: 'normal' | 'throttled' | 'saturated'
  hardware: ReturnType<typeof probeHardwareCapacity>
}

export function decideNarutoConcurrency(input: NarutoConcurrencyGovernorInput = {}): NarutoConcurrencyGovernorDecision {
  const requestedClones = normalizePositiveInt(input.requestedClones, 8)
  const totalWorkItems = normalizePositiveInt(input.totalWorkItems, requestedClones)
  const pending = normalizeNonNegativeInt(input.pendingWorkQueueSize, totalWorkItems)
  const leaseConflicts = normalizeNonNegativeInt(input.activeLeaseConflicts, 0)
  const hardware = probeHardwareCapacity(input.hardware || {})
  const zellijVisiblePaneCap = normalizePositiveInt(input.zellijVisiblePaneCap, Math.min(8, Math.max(4, Math.floor(hardware.terminal_rows / 5))))
  const backend = String(input.backend || 'codex-sdk')
  const parallelismMode = normalizeParallelismMode(input.parallelismMode)
  const freeGb = hardware.free_memory_bytes / (1024 * 1024 * 1024)
  const totalGb = hardware.total_memory_bytes / (1024 * 1024 * 1024)
  const reservedInteractiveGb = Math.max(2, totalGb * 0.2)
  const memoryBudgetGb = Math.max(0.5, freeGb - reservedInteractiveGb)
  const heavy = backend === 'codex-sdk' || backend === 'zellij' || backend === 'process' || backend === 'ollama'
  const gbPerWorker = heavy ? Number(process.env.SKS_NARUTO_GB_PER_WORKER || 1.5) : Number(process.env.SKS_NARUTO_LIGHT_GB_PER_WORKER || 0.5)
  const memoryCap = Math.max(1, Math.floor(memoryBudgetGb / Math.max(0.25, gbPerWorker)))
  const fdCap = Math.max(1, Math.floor((hardware.file_descriptor_limit - hardware.process_count) / 6))
  const cpuCap = Math.max(1, Math.min(4, Math.floor(hardware.cpu_core_count * (heavy ? 0.4 : 0.5))))
  const ioCap = Math.max(1, Math.min(2, Math.floor(hardware.cpu_core_count / 4)))
  const configuredProcessCap = Math.max(1, Number(process.env.SKS_NARUTO_HEADLESS_PROCESS_CAP || 4))
  const processCap = Math.min(configuredProcessCap, cpuCap, 4)
  const gitWorktreeCap = Math.max(1, Number(process.env.SKS_NARUTO_GIT_WORKTREE_CAP || Math.min(requestedClones, processCap)))
  const localLlmParallel = Math.max(1, Math.min(4, hardware.local_llm_max_parallel_requests))
  const remoteCodexParallel = Math.max(1, Math.min(hardware.remote_api_rate_limit_budget, requestedClones))
  const backendBudget = backend === 'ollama' || backend === 'local-llm'
    ? localLlmParallel
    : backend === 'codex-sdk' || backend === 'zellij'
      ? Math.min(remoteCodexParallel, processCap)
      : processCap
  const queueCap = Math.max(1, Math.min(requestedClones, pending || totalWorkItems))
  const leaseCap = Math.max(1, requestedClones - leaseConflicts)
  const rawSafe = Math.max(1, Math.min(requestedClones, totalWorkItems, memoryCap, fdCap, cpuCap, ioCap + 1, gitWorktreeCap, processCap, backendBudget, queueCap, leaseCap, 4))
  const pressure = monitorNarutoResourcePressure(hardware, { activeWorkers: rawSafe, zellijVisiblePaneCap })
  const backpressure = applyNarutoBackpressure(rawSafe, pressure)
  const currentSafeActiveWorkers = Math.max(1, Math.min(rawSafe, backpressure.adjusted_active_workers))
  // Every mode respects live backpressure. Modes only lower the bounded cap.
  const modeCap = parallelismMode === 'safe'
    ? Math.max(1, Math.ceil(rawSafe * 0.5))
    : parallelismMode === 'balanced'
      ? Math.max(1, Math.ceil(rawSafe * 0.75))
      : rawSafe
  const safeActiveWorkers = Math.max(1, Math.min(modeCap, currentSafeActiveWorkers))
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
    verification_parallel: Math.max(1, Math.min(2, safeActiveWorkers)),
    parallelism_mode: parallelismMode,
    reasons: [...new Set(reasons)],
    backpressure: backpressure.backpressure,
    hardware
  }
}

function normalizeParallelismMode(value: unknown): 'extreme' | 'balanced' | 'safe' {
  const text = String(value || process.env.SKS_NARUTO_PARALLELISM || 'safe').toLowerCase()
  if (text === 'safe' || text === 'balanced' || text === 'extreme') return text
  return 'safe'
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
