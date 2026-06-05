export type LocalLlmBackpressureState = 'normal' | 'throttled' | 'saturated'

export function classifyLocalLlmBackpressure(input: {
  activeRequests: number
  maxParallelRequests: number
  queueDepth: number
  p95LatencyMs?: number
}) {
  const max = Math.max(1, Math.floor(Number(input.maxParallelRequests || 1)))
  const active = Math.max(0, Math.floor(Number(input.activeRequests || 0)))
  const queue = Math.max(0, Math.floor(Number(input.queueDepth || 0)))
  const p95 = Math.max(0, Number(input.p95LatencyMs || 0))
  const state: LocalLlmBackpressureState = active >= max && queue >= max
    ? 'saturated'
    : active >= max || queue > max || p95 > 10_000
      ? 'throttled'
      : 'normal'
  return {
    schema: 'sks.local-llm-backpressure.v1',
    state,
    active_requests: active,
    max_parallel_requests: max,
    queue_depth: queue,
    p95_latency_ms: p95
  }
}
