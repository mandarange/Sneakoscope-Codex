// SKS Core Skill Engine — shared type contract (SkillOpt-derived).
//
// Skills are the frozen agent's external, versioned state. Deployment reads an
// immutable accepted snapshot. None of this mutates code/config/global files.

export const CORE_SKILL_CARD_SCHEMA = 'sks.core-skill-card.v1'

export type CoreSkillStatus = 'candidate' | 'accepted' | 'rejected' | 'deployed'

export interface CoreSkillSideEffectScope {
  allowed_mutations: string[]
  read_only: boolean
}

export interface CoreSkillValidation {
  heldout_score: number
  baseline_score: number
  strict_improvement: boolean
}

export interface CoreSkillCard {
  schema: string
  skill_id: string
  route: string
  version: number
  status: CoreSkillStatus
  body: string
  deployment_snapshot: boolean
  created_from?: { rollout_set?: string | null; optimizer_epoch?: number | null }
  validation?: CoreSkillValidation | null
  side_effect_scope: CoreSkillSideEffectScope
  body_hash?: string
  created_at?: string
}
