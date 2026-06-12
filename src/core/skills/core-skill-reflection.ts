// SKS Core Skill Engine — SkillOpt-style reflection stage.
//
// SkillOpt's training loop is rollout → reflection → aggregation → selection →
// validation-gated update. This module implements the reflect/aggregate/select
// stages deterministically (no model call): each scored rollout yields reflection
// records for its deficient score dimensions, reflections are aggregated and
// ranked across the batch, and the top-ranked deficiencies are mapped to bounded
// add-operations on the single skill document.

import { scoreRollout } from './core-skill-scorer.js'
import type { CoreRolloutTrace, CoreSkillCard, RolloutScoreComponents, SkillPatchOp, TextualLearningRate } from './core-skill-types.js'

export type SkillReflectionDimension = keyof RolloutScoreComponents

export interface SkillReflection {
  dimension: SkillReflectionDimension
  severity: number
  note: string
}

export interface AggregatedReflection {
  dimension: SkillReflectionDimension
  count: number
  severity: number
}

// dimension → { instruction line, target section, regex proving the card already covers it }
const DIMENSION_LESSONS: Record<SkillReflectionDimension, { target: string; text: string; covered: RegExp }> = {
  proof_completeness: {
    target: 'section:verification',
    text: '- Always emit a proof artifact before reporting success.',
    covered: /proof artifact/i
  },
  rollback_ready: {
    target: 'section:rollback',
    text: '- Record a rollback-ready checkpoint before mutating anything.',
    covered: /rollback/i
  },
  latency_budget: {
    target: 'section:latency',
    text: '- Prefer the smallest sufficient probe; stop expanding scope once the latency budget is at risk.',
    covered: /latency budget/i
  },
  requested_scope_compliance: {
    target: 'section:scope',
    text: '- Touch only what the request names; treat any out-of-scope mutation as a hard stop.',
    covered: /out-of-scope mutation/i
  },
  side_effect_zero: {
    target: 'section:scope',
    text: '- Leave zero side effects: never mutate outside the requested scope.',
    covered: /zero side effects/i
  },
  task_success: {
    target: 'section:method',
    text: '- Re-read the recorded failure reason and address it directly before retrying.',
    covered: /failure reason/i
  }
}

/** Reflect on one scored rollout: one reflection per deficient score dimension. */
export function reflectOnTrace(trace: CoreRolloutTrace, opts: { latencyBudgetMs?: number } = {}): SkillReflection[] {
  const score = scoreRollout(trace, opts)
  const reflections: SkillReflection[] = []
  for (const dimension of Object.keys(score.components) as SkillReflectionDimension[]) {
    const value = score.components[dimension]
    if (value >= 1) continue
    reflections.push({
      dimension,
      severity: Number((1 - value).toFixed(6)),
      note: trace.failure_reason ? `deficient ${dimension} (failure: ${trace.failure_reason})` : `deficient ${dimension}`
    })
  }
  return reflections
}

/** Aggregate reflections across a rollout batch, ranked by total severity then count. */
export function aggregateReflections(reflections: SkillReflection[]): AggregatedReflection[] {
  const byDimension = new Map<SkillReflectionDimension, AggregatedReflection>()
  for (const reflection of reflections) {
    const entry = byDimension.get(reflection.dimension) ?? { dimension: reflection.dimension, count: 0, severity: 0 }
    entry.count += 1
    entry.severity = Number((entry.severity + reflection.severity).toFixed(6))
    byDimension.set(reflection.dimension, entry)
  }
  return [...byDimension.values()].sort((a, b) => b.severity - a.severity || b.count - a.count || a.dimension.localeCompare(b.dimension))
}

/**
 * Select bounded patch operations from aggregated reflections. Skips lessons the
 * card body already covers, and truncates the selection so total added chars fit
 * the textual learning-rate budget.
 */
export function selectPatchOperations(
  card: CoreSkillCard,
  aggregated: AggregatedReflection[],
  learningRate: TextualLearningRate,
  opts: { maxOperations?: number } = {}
): SkillPatchOp[] {
  const maxOperations = Math.max(1, opts.maxOperations ?? 2)
  const operations: SkillPatchOp[] = []
  let addedChars = 0
  for (const entry of aggregated) {
    if (operations.length >= maxOperations) break
    const lesson = DIMENSION_LESSONS[entry.dimension]
    if (!lesson || lesson.covered.test(card.body)) continue
    if (operations.some((op) => op.op === 'add' && op.text === lesson.text)) continue
    if (addedChars + lesson.text.length > learningRate.max_added_chars) continue
    operations.push({ op: 'add', target: lesson.target, text: lesson.text })
    addedChars += lesson.text.length
  }
  return operations
}
