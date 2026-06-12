// SKS Core Skill Engine — SkillOpt-style epoch-wise meta-update.
//
// SkillOpt adjusts its textual learning rate between epochs: rejected edits decay
// the budget (smaller, safer proposals), accepted edits regrow it toward the
// default ceiling. Deterministic, bounded, never exceeds the configured maximum.

import { DEFAULT_TEXTUAL_LEARNING_RATE } from './core-skill-epoch.js'
import type { TextualLearningRate } from './core-skill-types.js'

export const MIN_TEXTUAL_LEARNING_RATE: TextualLearningRate = { max_added_chars: 100, max_deleted_chars: 50, max_replaced_chars: 75 }
export const META_UPDATE_DECAY = 0.5
export const META_UPDATE_GROWTH = 1.25

export type SkillEpochOutcome = 'accepted' | 'rejected'

export interface MetaUpdateOptions {
  decay?: number
  growth?: number
  min?: TextualLearningRate
  max?: TextualLearningRate
}

/** Epoch-wise textual learning-rate adjustment: decay on rejection, bounded regrowth on acceptance. */
export function metaUpdateLearningRate(rate: TextualLearningRate, outcome: SkillEpochOutcome, opts: MetaUpdateOptions = {}): TextualLearningRate {
  const decay = opts.decay ?? META_UPDATE_DECAY
  const growth = opts.growth ?? META_UPDATE_GROWTH
  const min = opts.min ?? MIN_TEXTUAL_LEARNING_RATE
  const max = opts.max ?? DEFAULT_TEXTUAL_LEARNING_RATE
  const factor = outcome === 'rejected' ? decay : growth
  const adjust = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(value * factor)))
  return {
    max_added_chars: adjust(rate.max_added_chars, min.max_added_chars, max.max_added_chars),
    max_deleted_chars: adjust(rate.max_deleted_chars, min.max_deleted_chars, max.max_deleted_chars),
    max_replaced_chars: adjust(rate.max_replaced_chars, min.max_replaced_chars, max.max_replaced_chars)
  }
}
