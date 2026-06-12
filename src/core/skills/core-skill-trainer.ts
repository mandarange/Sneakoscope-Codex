// SKS Core Skill Engine — SkillOpt-style multi-epoch trainer.
//
// Closes the SkillOpt training loop over the existing primitives: per epoch a
// rollout batch is reflected on (reflect → aggregate → select), the selected
// bounded edit goes through the strict held-out gate (runSkillEpoch), and the
// textual learning rate is meta-updated from the outcome. The best held-out
// accepted card is exported as the deployable best-skill artifact (SkillOpt's
// best_skill.md analogue). Pure/deterministic: the caller supplies the held-out
// evaluator; no model call is made here. Forbidden in deployment context.

import path from 'node:path'
import { ensureDir, nowIso, writeJsonAtomic } from '../fsx.js'
import { assertNotInDeployment } from './core-skill-deployment.js'
import { DEFAULT_TEXTUAL_LEARNING_RATE, runSkillEpoch } from './core-skill-epoch.js'
import { metaUpdateLearningRate } from './core-skill-meta-update.js'
import { applyPatch } from './core-skill-patch-apply.js'
import { aggregateReflections, reflectOnTrace, selectPatchOperations } from './core-skill-reflection.js'
import { CORE_SKILL_PATCH_SCHEMA, type CoreRolloutTrace, type CoreSkillCard, type CoreSkillPatch, type TextualLearningRate } from './core-skill-types.js'

export const CORE_SKILL_TRAINING_REPORT_SCHEMA = 'sks.core-skill-training-report.v1'

/** Held-out probe for one card. Supplied by the caller — the trainer never calls a model. */
export interface SkillHeldoutProbe {
  heldout: number
  sideEffectZero: boolean
  requestedScopeCompliant: boolean
  proofCompleteness: number
  rollbackReady: number
  latencyMs: number
}

export interface SkillTrainerInput {
  card: CoreSkillCard
  /** One rollout batch per optimization epoch. */
  epochs: CoreRolloutTrace[][]
  evaluateHeldout: (card: CoreSkillCard) => SkillHeldoutProbe
  learningRate?: TextualLearningRate
  latencyBudgetMs?: number
  maxOperationsPerEpoch?: number
}

export interface SkillTrainerEpochRecord {
  epoch: number
  accepted: boolean
  reason: string
  patch_hash: string | null
  score_delta: number
  learning_rate: TextualLearningRate
}

export interface SkillTrainerResult {
  epochs: SkillTrainerEpochRecord[]
  best: CoreSkillCard
  best_heldout: number
  baseline_heldout: number
  accepted_count: number
  report_path: string
  best_skill_path: string
}

/** Run the SkillOpt training loop in a TRAINING/EVALUATION context. */
export async function trainSkill(root: string, input: SkillTrainerInput): Promise<SkillTrainerResult> {
  assertNotInDeployment('trainSkill')
  let current = input.card
  let learningRate: TextualLearningRate = { ...(input.learningRate ?? DEFAULT_TEXTUAL_LEARNING_RATE) }
  let currentProbe = input.evaluateHeldout(current)
  const baselineHeldout = currentProbe.heldout
  const records: SkillTrainerEpochRecord[] = []
  let acceptedCount = 0

  for (let epoch = 0; epoch < input.epochs.length; epoch += 1) {
    const traces = input.epochs[epoch] ?? []
    const reflections = traces.flatMap((trace) => reflectOnTrace(trace, { ...(input.latencyBudgetMs === undefined ? {} : { latencyBudgetMs: input.latencyBudgetMs }) }))
    const aggregated = aggregateReflections(reflections)
    const operations = selectPatchOperations(current, aggregated, learningRate, { ...(input.maxOperationsPerEpoch === undefined ? {} : { maxOperations: input.maxOperationsPerEpoch }) })
    if (!operations.length) {
      records.push({ epoch, accepted: false, reason: 'no_proposal', patch_hash: null, score_delta: 0, learning_rate: { ...learningRate } })
      continue
    }
    const patch: CoreSkillPatch = {
      schema: CORE_SKILL_PATCH_SCHEMA,
      skill_id: current.skill_id,
      base_version: current.version,
      operations,
      textual_learning_rate: { ...learningRate }
    }
    // Probe the candidate's held-out score BEFORE the gated update.
    const preview = applyPatch(current, patch)
    const candidateProbe = preview.ok && preview.candidate ? input.evaluateHeldout(preview.candidate) : currentProbe
    const result = await runSkillEpoch(root, {
      card: current,
      trainTraces: traces,
      patch,
      validation: {
        baselineHeldout: currentProbe.heldout,
        candidateHeldout: candidateProbe.heldout,
        sideEffectZero: candidateProbe.sideEffectZero,
        requestedScopeCompliant: candidateProbe.requestedScopeCompliant,
        proofCompletenessBaseline: currentProbe.proofCompleteness,
        proofCompletenessCandidate: candidateProbe.proofCompleteness,
        rollbackReadyBaseline: currentProbe.rollbackReady,
        rollbackReadyCandidate: candidateProbe.rollbackReady,
        latencyBaselineMs: currentProbe.latencyMs,
        latencyCandidateMs: candidateProbe.latencyMs
      }
    })
    records.push({ epoch, accepted: result.accepted, reason: result.reason, patch_hash: result.patch_hash, score_delta: result.score_delta, learning_rate: { ...learningRate } })
    if (result.accepted && result.candidate) {
      current = result.candidate
      currentProbe = candidateProbe
      acceptedCount += 1
      learningRate = metaUpdateLearningRate(learningRate, 'accepted')
    } else {
      learningRate = metaUpdateLearningRate(learningRate, 'rejected')
    }
  }

  const reportsDir = path.join(path.resolve(root), '.sneakoscope', 'reports')
  await ensureDir(reportsDir)
  const reportPath = path.join(reportsDir, 'core-skill-training-report.json')
  const skillDir = path.join(path.resolve(root), '.sneakoscope', 'skills', current.route, current.skill_id)
  await ensureDir(skillDir)
  const bestSkillPath = path.join(skillDir, 'best-skill.json')
  await writeJsonAtomic(bestSkillPath, { ...current, exported_as: 'best_skill', exported_at: nowIso() })
  await writeJsonAtomic(reportPath, {
    schema: CORE_SKILL_TRAINING_REPORT_SCHEMA,
    skill_id: input.card.skill_id,
    route: input.card.route,
    baseline_heldout: baselineHeldout,
    best_heldout: currentProbe.heldout,
    best_version: current.version,
    accepted_count: acceptedCount,
    epochs: records,
    generated_at: nowIso()
  })
  return {
    epochs: records,
    best: current,
    best_heldout: currentProbe.heldout,
    baseline_heldout: baselineHeldout,
    accepted_count: acceptedCount,
    report_path: reportPath,
    best_skill_path: bestSkillPath
  }
}
