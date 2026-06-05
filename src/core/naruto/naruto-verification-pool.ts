import { runVerificationDag } from '../verification/verification-worker-pool.js'
import type { ParallelVerificationResult } from '../verification/verification-result.js'
import type { NarutoConcurrencyGovernorDecision } from './naruto-concurrency-governor.js'
import type { NarutoVerificationDag } from './naruto-verification-dag.js'

export interface NarutoVerificationPoolReport extends ParallelVerificationResult {
  naruto_schema: 'sks.naruto-verification-pool.v1'
  safe_concurrency: number
  cpu_heavy_cap_respected: boolean
  io_heavy_cap_respected: boolean
  api_rate_cap_respected: boolean
}

export async function runNarutoVerificationPool(dag: NarutoVerificationDag, governor: NarutoConcurrencyGovernorDecision, opts: { cwd?: string; logDir?: string } = {}): Promise<NarutoVerificationPoolReport> {
  const safeConcurrency = Math.max(1, governor.verification_parallel)
  const result = await runVerificationDag(dag, {
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    ...(opts.logDir ? { logDir: opts.logDir } : {}),
    concurrency: safeConcurrency
  })
  return {
    ...result,
    naruto_schema: 'sks.naruto-verification-pool.v1',
    safe_concurrency: safeConcurrency,
    cpu_heavy_cap_respected: safeConcurrency <= Math.max(1, governor.hardware.cpu_core_count * 2),
    io_heavy_cap_respected: governor.backpressure !== 'saturated',
    api_rate_cap_respected: safeConcurrency <= Math.max(1, governor.remote_codex_parallel)
  }
}

