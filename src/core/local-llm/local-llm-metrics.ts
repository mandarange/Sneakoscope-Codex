import { classifyLocalLlmBackpressure } from './local-llm-backpressure.js'

export function buildLocalLlmMetrics(input: {
  provider?: string
  model?: string
  activeRequests?: number
  maxParallelRequests?: number
  queueDepth?: number
  firstTokenMsSamples?: number[]
  tokenPerSecondSamples?: number[]
  latencyMsSamples?: number[]
}) {
  const latencies = numeric(input.latencyMsSamples)
  const metrics = {
    schema: 'sks.local-llm-metrics.v1',
    provider: input.provider || 'ollama',
    model: input.model || 'unknown',
    active_requests: Math.max(0, Math.floor(Number(input.activeRequests || 0))),
    max_parallel_requests: Math.max(1, Math.floor(Number(input.maxParallelRequests || 1))),
    queue_depth: Math.max(0, Math.floor(Number(input.queueDepth || 0))),
    avg_first_token_ms: average(numeric(input.firstTokenMsSamples)),
    avg_tokens_per_second: average(numeric(input.tokenPerSecondSamples)),
    p95_latency_ms: percentile(latencies, 0.95)
  }
  const backpressureInput: {
    activeRequests: number
    maxParallelRequests: number
    queueDepth: number
    p95LatencyMs?: number
  } = {
    activeRequests: metrics.active_requests,
    maxParallelRequests: metrics.max_parallel_requests,
    queueDepth: metrics.queue_depth
  }
  if (metrics.p95_latency_ms !== undefined) backpressureInput.p95LatencyMs = metrics.p95_latency_ms
  return {
    ...metrics,
    backpressure: classifyLocalLlmBackpressure(backpressureInput).state
  }
}

function numeric(values: unknown[] = []) {
  return values.map(Number).filter((value) => Number.isFinite(value) && value >= 0)
}

function average(values: number[]) {
  if (!values.length) return 0
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)
  return sorted[index]
}
