import path from 'node:path'
import { randomId, sha256 } from '../fsx.js'
import { TASK_PROFILE_GATE_PROFILES, isTaskProfile } from '../runtime/task-profile.js'
import { DECISION_COUNT_SOURCES, DECISION_EFFORTS, DECISION_GATE_PROFILES, validateDecisionInput } from './schema.js'
import type { DecisionCountSource, DecisionEffort, DecisionInput, DecisionKind, DecisionScope } from './types.js'

export const MAX_SUMMARY_CHARS = 2_000
/** Task profiles for which a planning opinion can matter; everything else keeps the baseline without a call. */
export const ELIGIBLE_PLANNING_PROFILES = Object.freeze(['bounded-work', 'parallel-read', 'parallel-write', 'high-risk'])

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g,
  /\bhf_[A-Za-z0-9]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g
]

/** Bounded, redacted, whitespace-normalized text for the model. Raw logs are never forwarded. */
export function redactSummary(text: string, maxChars = MAX_SUMMARY_CHARS): string {
  let out = String(text || '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, '[redacted]')
  if (out.length > maxChars) out = `${out.slice(0, maxChars - 12).trimEnd()} [truncated]`
  return out || '(empty summary)'
}

export function projectDigestFor(root: string): string {
  return sha256(path.resolve(root)).slice(0, 32)
}

export interface PlanningSnapshotSource {
  root: string
  missionId: string
  workflowRunId: string
  goal: string
  /** The promoted subagent plan (already authoritative; read only). */
  plan: Record<string, any>
  taskProfile: string
  budget: { requestedSubagents: number }
}

function uniformEffort(plan: Record<string, any>): DecisionEffort | null {
  const agents = plan?.agents && typeof plan.agents === 'object' ? Object.values(plan.agents as Record<string, any>) : []
  const efforts = new Set<string>()
  for (const agent of agents) {
    const effort = String(agent?.routed_model_reasoning_effort || '').trim()
    if (effort) efforts.add(effort)
  }
  if (efforts.size !== 1) return null
  const [only] = efforts
  return DECISION_EFFORTS.includes(only as DecisionEffort) ? (only as DecisionEffort) : null
}

/** Immutable snapshot of the baseline facts the advice may look at. The plan is not modified. */
export function buildPlanningDecisionInput(source: PlanningSnapshotSource): DecisionInput {
  const taskProfile = String(source.taskProfile || '').trim()
  const gateProfile = isTaskProfile(taskProfile) ? TASK_PROFILE_GATE_PROFILES[taskProfile] : 'scoped'
  const rawSource = String(source.plan?.requested_subagents_source || 'automatic')
  const countSource: DecisionCountSource = DECISION_COUNT_SOURCES.includes(rawSource as DecisionCountSource) ? (rawSource as DecisionCountSource) : 'operator'
  const overrides = source.plan?.role_model_preferences?.overrides
  const rolePreferenceExplicit = Boolean(overrides && typeof overrides === 'object' && Object.keys(overrides).length > 0)
  const baselineEffort = uniformEffort(source.plan)
  const summary = redactSummary(source.goal)
  const facts = {
    taskProfile,
    gateProfile,
    countSource,
    baselineAgents: Math.max(0, Math.min(256, Number(source.budget?.requestedSubagents ?? source.plan?.requested_subagents ?? 0) || 0)),
    baselineEffort,
    rolePreferenceExplicit,
    highRisk: taskProfile === 'high-risk',
    evidenceFresh: true,
    failedChecks: 0,
    attemptIndex: 0
  }
  const snapshotDigest = sha256(JSON.stringify({
    workflowRunId: source.workflowRunId,
    goal: sha256(summary),
    facts
  })).slice(0, 32)
  const input: DecisionInput = {
    schemaVersion: 1,
    requestId: `plan-${randomId(10)}`,
    kind: 'planning',
    scope: {
      projectDigest: projectDigestFor(source.root),
      missionId: String(source.missionId),
      workflowRunId: String(source.workflowRunId),
      snapshotDigest
    },
    summary,
    facts
  }
  return validateDecisionInput(input)
}

export function planningEligible(taskProfile: string): boolean {
  return ELIGIBLE_PLANNING_PROFILES.includes(taskProfile)
}

/** Deterministic shadow sampling from the scope hash so a run is reproducible. */
export function shadowSampleSelected(scope: DecisionScope, rate: number): boolean {
  if (!(rate > 0)) return false
  if (rate >= 1) return true
  const bucket = parseInt(sha256(`${scope.projectDigest}:${scope.workflowRunId}:${scope.snapshotDigest}`).slice(0, 8), 16) / 0x100000000
  return bucket < rate
}

/**
 * Explicit CLI input: a user-supplied JSON object with `summary` and `facts`.
 * The facts are marked as user-supplied by construction (they only ever
 * reach the model, never any completion evidence). Missing scope fields are
 * filled with an `explicit` marker so the result cannot be mistaken for a
 * mission decision.
 */
export function normalizeExplicitDecisionInput(value: unknown, kind: DecisionKind): DecisionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('decision_input_must_be_object')
  const record = value as Record<string, unknown>
  if (record.kind !== undefined && record.kind !== kind) throw new Error(`decision_input_kind_mismatch:${String(record.kind)}!=${kind}`)
  const facts = record.facts && typeof record.facts === 'object' ? { ...(record.facts as Record<string, unknown>) } : {}
  const scope = record.scope && typeof record.scope === 'object' ? (record.scope as Record<string, unknown>) : {}
  const summary = redactSummary(String(record.summary ?? ''), 8_000)
  const defaults = {
    taskProfile: 'bounded-work', gateProfile: 'scoped', countSource: 'automatic', baselineAgents: 4,
    baselineEffort: null, rolePreferenceExplicit: false, highRisk: false, evidenceFresh: true,
    failedChecks: kind === 'recovery' ? 1 : 0, attemptIndex: 0
  }
  const merged: Record<string, unknown> = { ...defaults }
  for (const key of Object.keys(defaults)) if (facts[key] !== undefined) merged[key] = facts[key]
  for (const key of Object.keys(facts)) if (!(key in defaults)) throw new Error(`decision_input_unknown_fact:${key}`)
  if (typeof merged.gateProfile === 'string' && !DECISION_GATE_PROFILES.includes(merged.gateProfile as any)) throw new Error(`decision_input_invalid_gate_profile:${String(merged.gateProfile)}`)
  const input = {
    schemaVersion: 1 as const,
    requestId: typeof record.requestId === 'string' && record.requestId ? record.requestId : `explicit-${randomId(10)}`,
    kind,
    scope: {
      projectDigest: String(scope.projectDigest || 'explicit'),
      missionId: String(scope.missionId || 'explicit'),
      workflowRunId: String(scope.workflowRunId || 'explicit'),
      snapshotDigest: String(scope.snapshotDigest || sha256(summary).slice(0, 32))
    },
    summary,
    facts: merged as unknown as DecisionInput['facts']
  }
  return validateDecisionInput(input)
}
