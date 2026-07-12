export const DEFAULT_NARUTO_MAX_THREADS = 12
export const HARD_NARUTO_MAX_THREADS = 32
export const DEFAULT_NARUTO_REQUESTED_SUBAGENTS = 6

export interface SubagentThreadBudget {
  requestedSubagents: number
  maxThreads: number
  firstWave: number
  waveCount: number
  maxDepth: 1
}

export function resolveSubagentThreadBudget(input: {
  requested?: number | undefined
  configuredMaxThreads?: number | undefined
  independentSliceCount?: number | undefined
} = {}): SubagentThreadBudget {
  const requested = clamp(
    input.requested ?? input.independentSliceCount ?? DEFAULT_NARUTO_REQUESTED_SUBAGENTS,
    1,
    HARD_NARUTO_MAX_THREADS
  )
  const configured = clamp(
    input.configuredMaxThreads ?? DEFAULT_NARUTO_MAX_THREADS,
    1,
    HARD_NARUTO_MAX_THREADS
  )

  return {
    requestedSubagents: requested,
    maxThreads: configured,
    firstWave: Math.min(requested, configured),
    waveCount: Math.ceil(requested / configured),
    maxDepth: 1
  }
}

function clamp(value: unknown, minimum: number, maximum: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return minimum
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)))
}
