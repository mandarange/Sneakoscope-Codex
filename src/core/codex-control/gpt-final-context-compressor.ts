import { buildGptFinalLatencyBudgetReport, buildGptFinalProofPack, type GptFinalArbiterInput } from './gpt-final-proof-pack.js'

export function compressGptFinalContext(input: GptFinalArbiterInput, opts: { maxCriticalLogChars?: number; latencyMs?: number | null } = {}) {
  const proofPack = buildGptFinalProofPack(input, opts)
  const latencyBudget = buildGptFinalLatencyBudgetReport({
    workerCount: proofPack.worker_count,
    tokenBudgetEstimate: proofPack.token_budget_estimate,
    latencyMs: opts.latencyMs ?? null
  })
  return {
    schema: 'sks.gpt-final-context-compressor.v1',
    ok: latencyBudget.ok,
    proof_pack: proofPack,
    latency_budget: latencyBudget,
    blockers: latencyBudget.ok ? [] : ['gpt_final_context_budget_exceeded']
  }
}
