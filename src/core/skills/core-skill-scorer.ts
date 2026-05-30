import path from 'node:path'
import { ensureDir, nowIso, writeJsonAtomic } from '../fsx.js'
import {
  CORE_SKILL_SCORE_SCHEMA,
  type CoreRolloutTrace,
  type RolloutScore,
  type RolloutScoreComponents
} from './core-skill-types.js'

export const DEFAULT_LATENCY_BUDGET_MS = 60_000

/**
 * Score a rollout trace. A side-effect-zero violation (mutations beyond requested
 * scope) is a HARD fail: the score is driven negative so the candidate can never
 * be accepted regardless of task success. Proof-less success scores low.
 */
export function scoreRollout(trace: CoreRolloutTrace, opts: { latencyBudgetMs?: number } = {}): RolloutScore {
  const latencyBudget = Math.max(1, opts.latencyBudgetMs ?? DEFAULT_LATENCY_BUDGET_MS)
  const hadSideEffect = trace.side_effect_ledger.length > 0
  const sideEffectViolation = trace.requested_scope_compliant !== true || (hadSideEffect && trace.requested_scope_compliant !== true)
  const components: RolloutScoreComponents = {
    task_success: trace.failure_reason ? 0 : 1,
    proof_completeness: trace.proof_artifacts.length > 0 ? 1 : 0,
    side_effect_zero: trace.side_effect_ledger.length === 0 ? 1 : 0,
    latency_budget: trace.latency_ms <= latencyBudget ? 1 : Math.max(0, latencyBudget / Math.max(trace.latency_ms, 1)),
    rollback_ready: trace.rollback_ready ? 1 : 0,
    requested_scope_compliance: trace.requested_scope_compliant ? 1 : 0
  }
  const raw =
    components.task_success +
    components.proof_completeness +
    components.side_effect_zero +
    components.latency_budget +
    components.rollback_ready +
    components.requested_scope_compliance
  // Hard fail: any requested-scope violation forces a negative score.
  const score = sideEffectViolation ? -1 : raw
  return {
    schema: CORE_SKILL_SCORE_SCHEMA,
    score,
    components,
    side_effect_violation: sideEffectViolation,
    skill_id: trace.skill_id,
    skill_version: trace.skill_version
  }
}

/** Aggregate score across a set of rollouts (mean), preserving any violation as a hard fail. */
export function scoreRollouts(traces: CoreRolloutTrace[], opts: { latencyBudgetMs?: number } = {}): RolloutScore {
  if (!traces.length) {
    return {
      schema: CORE_SKILL_SCORE_SCHEMA,
      score: 0,
      components: { task_success: 0, proof_completeness: 0, side_effect_zero: 0, latency_budget: 0, rollback_ready: 0, requested_scope_compliance: 0 },
      side_effect_violation: false,
      skill_id: null,
      skill_version: null
    }
  }
  const scores = traces.map((trace) => scoreRollout(trace, opts))
  const violation = scores.some((s) => s.side_effect_violation)
  const mean = (pick: (c: RolloutScoreComponents) => number) => scores.reduce((sum, s) => sum + pick(s.components), 0) / scores.length
  const components: RolloutScoreComponents = {
    task_success: mean((c) => c.task_success),
    proof_completeness: mean((c) => c.proof_completeness),
    side_effect_zero: mean((c) => c.side_effect_zero),
    latency_budget: mean((c) => c.latency_budget),
    rollback_ready: mean((c) => c.rollback_ready),
    requested_scope_compliance: mean((c) => c.requested_scope_compliance)
  }
  const raw = Object.values(components).reduce((a, b) => a + b, 0)
  return {
    schema: CORE_SKILL_SCORE_SCHEMA,
    score: violation ? -1 : raw,
    components,
    side_effect_violation: violation,
    skill_id: scores[0]?.skill_id ?? null,
    skill_version: scores[0]?.skill_version ?? null
  }
}

export async function writeRolloutScore(root: string, score: RolloutScore): Promise<string> {
  const file = path.join(path.resolve(root), '.sneakoscope', 'reports', 'core-skill-rollout-score.json')
  await ensureDir(path.dirname(file))
  await writeJsonAtomic(file, { ...score, generated_at: nowIso() })
  return file
}
