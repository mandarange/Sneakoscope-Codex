import { buildLocalLlmMetrics } from './local-llm-metrics.js'

export function planLocalLlmSchedule(input: {
  workItems: unknown[]
  maxParallelRequests: number
  activeRequests?: number
  latencyMsSamples?: number[]
}) {
  const max = Math.max(1, Math.floor(Number(input.maxParallelRequests || 1)))
  const active = Math.max(0, Math.floor(Number(input.activeRequests || 0)))
  const available = Math.max(0, max - active)
  const queueDepth = Math.max(0, input.workItems.length - available)
  const dispatch = input.workItems.slice(0, available)
  const queued = input.workItems.slice(available)
  const metrics = buildLocalLlmMetrics({
    activeRequests: active + dispatch.length,
    maxParallelRequests: max,
    queueDepth,
    latencyMsSamples: input.latencyMsSamples || []
  })
  return {
    schema: 'sks.local-llm-scheduler-plan.v1',
    ok: metrics.active_requests <= max,
    max_parallel_requests: max,
    active_requests: metrics.active_requests,
    dispatch_count: dispatch.length,
    queued_count: queued.length,
    backpressure: metrics.backpressure,
    dispatch,
    queued,
    metrics,
    blockers: metrics.active_requests <= max ? [] : ['local_llm_active_requests_exceeded']
  }
}
