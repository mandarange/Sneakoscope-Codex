import fsp from 'node:fs/promises'
import path from 'node:path'
import { sha256 } from '../fsx.js'
import {
  SUBAGENT_EVIDENCE_FILENAME,
  SUBAGENT_EVENT_LOG_FILENAME,
  SUBAGENT_PARENT_SUMMARY_FILENAME,
  buildSubagentEvidence,
  normalizeSubagentEvent,
  normalizeSubagentParentSummary
} from './subagent-evidence.js'
import {
  NARUTO_GATE_FILENAME,
  NARUTO_RESULT_SCHEMA,
  NARUTO_SUMMARY_FILENAME,
  SUBAGENT_PLAN_FILENAME
} from './official-subagent-preparation.js'
import {
  effectiveSubagentTarget,
  normalizeLegacySubagentCountFields,
  subagentCountContractBlockers
} from './wave-lifecycle.js'

export const NARUTO_PROOF_ARTIFACT_FILENAMES = Object.freeze([
  SUBAGENT_PLAN_FILENAME,
  SUBAGENT_EVENT_LOG_FILENAME,
  SUBAGENT_PARENT_SUMMARY_FILENAME,
  SUBAGENT_EVIDENCE_FILENAME,
  NARUTO_SUMMARY_FILENAME,
  NARUTO_GATE_FILENAME
] as const)

export type NarutoProofStatus = 'completed' | 'blocked' | 'incomplete'

type NarutoProofArtifactFilename = typeof NARUTO_PROOF_ARTIFACT_FILENAMES[number]

export interface NarutoProofVerification {
  name: string
  status: 'passed' | 'failed' | 'blocked' | 'skipped' | 'pending' | 'unknown' | 'reported'
}

export interface NarutoProofResult {
  summary: string
  changed_files: string[]
  verification: NarutoProofVerification[]
}

export interface NarutoProofArtifactSnapshot {
  bytes: Record<NarutoProofArtifactFilename, Buffer | null>
  byte_hashes: Record<NarutoProofArtifactFilename, string | null>
  read_blockers: string[]
}

export interface NarutoProofProjection {
  schema: typeof NARUTO_RESULT_SCHEMA
  action: 'proof'
  ok: boolean
  status: NarutoProofStatus
  mission_id: string
  workflow: 'official_codex_subagent'
  workflow_run_id: string | null
  evidence: unknown
  summary: unknown
  gate: unknown
  result: NarutoProofResult
  proof_fingerprint: string
  blockers?: string[]
}

const MAX_RESULT_SUMMARY_CHARS = 4096
const MAX_CHANGED_FILES = 256
const MAX_CHANGED_FILE_CHARS = 512
const MAX_VERIFICATION_ROWS = 32
const MAX_VERIFICATION_NAME_CHARS = 240
const INCOMPLETE_BLOCKER_PATTERNS = [
  /^proof_artifact_missing:/,
  /^requested_subagent_(?:starts|completions)_incomplete:/,
  /^subagent_threads_still_open:/,
  /^parent_summary_missing$/,
  /^subagent_workflow_preparation_only$/,
  /^official_subagent_execution_pending_in_current_parent$/
]

export async function readNarutoProofArtifactSnapshot(artifactDir: string): Promise<NarutoProofArtifactSnapshot> {
  const rows = await Promise.all(NARUTO_PROOF_ARTIFACT_FILENAMES.map(async (filename) => {
    try {
      return { filename, bytes: await fsp.readFile(path.join(artifactDir, filename)), blocker: null }
    } catch (error: unknown) {
      const code = errorCode(error)
      return {
        filename,
        bytes: null,
        blocker: code === 'ENOENT'
          ? `proof_artifact_missing:${filename}`
          : `proof_artifact_unreadable:${filename}`
      }
    }
  }))
  const bytes = {} as Record<NarutoProofArtifactFilename, Buffer | null>
  const byteHashes = {} as Record<NarutoProofArtifactFilename, string | null>
  const blockers: string[] = []
  for (const row of rows) {
    bytes[row.filename] = row.bytes
    byteHashes[row.filename] = row.bytes ? `sha256:${sha256(row.bytes)}` : null
    if (row.blocker) blockers.push(row.blocker)
  }
  return { bytes, byte_hashes: byteHashes, read_blockers: blockers }
}

export async function buildNarutoProofProjection(input: {
  artifactDir: string
  missionId: string
}): Promise<NarutoProofProjection> {
  const snapshot = await readNarutoProofArtifactSnapshot(input.artifactDir)
  return projectNarutoProofSnapshot({ snapshot, missionId: input.missionId })
}

export function projectNarutoProofSnapshot(input: {
  snapshot: NarutoProofArtifactSnapshot
  missionId: string
}): NarutoProofProjection {
  const missionId = String(input.missionId || '').trim()
  const blockers = [...input.snapshot.read_blockers]
  const plan = parseJsonArtifact(input.snapshot, SUBAGENT_PLAN_FILENAME, blockers)
  const parentSummaryValue = parseJsonArtifact(input.snapshot, SUBAGENT_PARENT_SUMMARY_FILENAME, blockers)
  const persistedEvidence = normalizeLegacySubagentCountFields(parseJsonArtifact(input.snapshot, SUBAGENT_EVIDENCE_FILENAME, blockers), isRecord(plan) ? plan : null)
  const summary = normalizeLegacySubagentCountFields(parseJsonArtifact(input.snapshot, NARUTO_SUMMARY_FILENAME, blockers), isRecord(plan) ? plan : null)
  const gate = normalizeLegacySubagentCountFields(parseJsonArtifact(input.snapshot, NARUTO_GATE_FILENAME, blockers), isRecord(plan) ? plan : null)
  const events = parseJsonlArtifact(input.snapshot, blockers)
  const workflowRunId = firstText(recordValue(plan, 'workflow_run_id')) || null

  validateArtifactIdentities({ missionId, workflowRunId, plan, persistedEvidence, summary, gate }, blockers)
  const normalizedParentSummary = normalizeSubagentParentSummary(parentSummaryValue)
  if (parentSummaryValue !== null && !normalizedParentSummary.trustworthy) {
    blockers.push(...normalizedParentSummary.blockers)
  }
  if (normalizedParentSummary.run_id && workflowRunId && normalizedParentSummary.run_id !== workflowRunId) {
    blockers.push('proof_parent_summary_run_identity_mismatch')
  }

  const planRequestedSubagents = positiveInteger(recordValue(plan, 'requested_subagents'))
  const observedStarts = new Set(events
    .filter((event) => recordValue(event, 'event_name') === 'SubagentStart'
      && firstText(recordValue(event, 'run_id')) === workflowRunId)
    .map((event) => firstText(recordValue(event, 'thread_id')))
    .filter(Boolean)).size
  const countTarget = effectiveSubagentTarget(isRecord(plan) ? plan : null, observedStarts)
  validateCountContractArtifacts({
    persistedEvidence,
    summary,
    gate,
    countPolicy: countTarget.countPolicy,
    targetSubagents: countTarget.targetSubagents
  }, blockers)
  const rebuiltEvidence = planRequestedSubagents === null
    ? null
    : buildSubagentEvidence({
        requestedSubagents: countTarget.requestedSubagents,
        countPolicy: countTarget.countPolicy,
        targetSubagents: countTarget.targetSubagents,
        events,
        parentSummary: parentSummaryValue,
        parentSummaryPresent: parentSummaryValue !== null,
        workflowStatus: firstText(recordValue(summary, 'status')),
        preparationOnly: recordValue(persistedEvidence, 'preparation_only') === true,
        runId: workflowRunId,
        additionalBlockers: subagentCountContractBlockers(isRecord(plan) ? plan : null, observedStarts)
      })
  if (planRequestedSubagents === null && plan !== null) blockers.push('proof_plan_requested_subagents_invalid')
  const evidenceInputsPresent = input.snapshot.bytes[SUBAGENT_PLAN_FILENAME] !== null
    && input.snapshot.bytes[SUBAGENT_EVENT_LOG_FILENAME] !== null
    && input.snapshot.bytes[SUBAGENT_PARENT_SUMMARY_FILENAME] !== null
  if (evidenceInputsPresent) validatePersistedEvidence(persistedEvidence, rebuiltEvidence, blockers)

  const changedFiles = projectChangedFiles(normalizedParentSummary.raw?.changed_files, blockers)
  const verification = projectVerification(normalizedParentSummary.raw?.verification, blockers)
  const parentText = normalizedParentSummary.summary || ''
  if (parentText.length > MAX_RESULT_SUMMARY_CHARS) blockers.push('proof_result_summary_too_large')
  if (containsLeakageMarker(parentText)) blockers.push('proof_result_summary_sensitive')
  const result: NarutoProofResult = {
    summary: normalizedParentSummary.trustworthy
      && parentText.length <= MAX_RESULT_SUMMARY_CHARS
      && !containsLeakageMarker(parentText)
      ? parentText
      : '',
    changed_files: changedFiles,
    verification
  }

  const completed = gatePassed(gate)
    && recordValue(persistedEvidence, 'ok') === true
    && firstText(recordValue(persistedEvidence, 'status')).toLowerCase() === 'completed'
    && rebuiltEvidence?.ok === true
    && normalizedParentSummary.trustworthy
    && normalizedParentSummary.status === 'completed'
    && firstText(recordValue(summary, 'status')).toLowerCase() === 'completed'
    && recordValue(summary, 'ok') === true
    && recordValue(summary, 'completion_evidence') === true
    && blockers.length === 0
  const explicitBlocked = !completed && isExplicitlyBlocked({
    blockers,
    parentStatus: normalizedParentSummary.status,
    evidenceStatus: firstText(recordValue(persistedEvidence, 'status')),
    failedThreads: Number(recordValue(persistedEvidence, 'failed_threads') || 0),
    summaryStatus: firstText(recordValue(summary, 'status')),
    gate
  })
  const status: NarutoProofStatus = completed ? 'completed' : explicitBlocked ? 'blocked' : 'incomplete'
  const ok = status === 'completed'
  blockers.push(...validateNarutoProofStatus({ status, ok }))
  const uniqueBlockers = uniqueStrings(blockers)
  const proofFingerprint = fingerprintProof({
    status,
    missionId,
    workflowRunId,
    artifactHashes: input.snapshot.byte_hashes,
    result
  })

  return {
    schema: NARUTO_RESULT_SCHEMA,
    action: 'proof',
    ok,
    status,
    mission_id: missionId,
    workflow: 'official_codex_subagent',
    workflow_run_id: workflowRunId,
    evidence: persistedEvidence,
    summary,
    gate,
    result,
    proof_fingerprint: proofFingerprint,
    ...(uniqueBlockers.length > 0 ? { blockers: uniqueBlockers } : {})
  }
}

export function validateNarutoProofStatus(value: { status: unknown; ok: unknown }): string[] {
  const status = String(value.status || '').trim()
  if (status !== 'completed' && status !== 'blocked' && status !== 'incomplete') {
    return ['proof_status_invalid']
  }
  return value.ok === (status === 'completed') ? [] : ['proof_status_ok_inconsistent']
}

function parseJsonArtifact(
  snapshot: NarutoProofArtifactSnapshot,
  filename: Exclude<NarutoProofArtifactFilename, typeof SUBAGENT_EVENT_LOG_FILENAME>,
  blockers: string[]
): unknown {
  const bytes = snapshot.bytes[filename]
  if (!bytes) return null
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    blockers.push(`proof_artifact_malformed:${filename}`)
    return null
  }
}

function parseJsonlArtifact(snapshot: NarutoProofArtifactSnapshot, blockers: string[]): unknown[] {
  const bytes = snapshot.bytes[SUBAGENT_EVENT_LOG_FILENAME]
  if (!bytes) return []
  const rows: unknown[] = []
  const lines = bytes.toString('utf8').split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line?.trim()) continue
    try {
      const parsed = JSON.parse(line)
      const event = normalizeSubagentEvent(parsed)
      if (!event) blockers.push(`proof_event_invalid:${index + 1}`)
      else rows.push(event)
    } catch {
      blockers.push(`proof_event_malformed:${index + 1}`)
    }
  }
  return rows
}

function validateArtifactIdentities(input: {
  missionId: string
  workflowRunId: string | null
  plan: unknown
  persistedEvidence: unknown
  summary: unknown
  gate: unknown
}, blockers: string[]): void {
  if (!input.missionId) blockers.push('proof_mission_id_missing')
  if (input.plan !== null) {
    if (recordValue(input.plan, 'schema') !== 'sks.subagent-plan.v1') blockers.push('proof_plan_schema_invalid')
    if (recordValue(input.plan, 'workflow') !== 'official_codex_subagent') blockers.push('proof_plan_workflow_invalid')
    if (!input.workflowRunId) blockers.push('proof_workflow_run_id_missing')
    if (firstText(recordValue(input.plan, 'mission_id')) !== input.missionId) blockers.push('proof_plan_mission_identity_mismatch')
  }
  if (input.persistedEvidence !== null) {
    if (recordValue(input.persistedEvidence, 'schema') !== 'sks.subagent-evidence.v1') blockers.push('proof_evidence_schema_invalid')
    if (recordValue(input.persistedEvidence, 'workflow') !== 'official_codex_subagent') blockers.push('proof_evidence_workflow_invalid')
    if (input.workflowRunId && firstText(recordValue(input.persistedEvidence, 'run_id')) !== input.workflowRunId) {
      blockers.push('proof_evidence_run_identity_mismatch')
    }
  }
  if (input.summary !== null) {
    validateMissionRunArtifact(input.summary, 'summary', input.missionId, input.workflowRunId, blockers)
    if (recordValue(input.summary, 'schema') !== NARUTO_RESULT_SCHEMA) blockers.push('proof_summary_schema_invalid')
  }
  if (input.gate !== null) {
    validateMissionRunArtifact(input.gate, 'gate', input.missionId, input.workflowRunId, blockers)
    if (recordValue(input.gate, 'schema') !== 'sks.naruto-gate.v1') blockers.push('proof_gate_schema_invalid')
  }
}

function validateMissionRunArtifact(
  value: unknown,
  label: 'summary' | 'gate',
  missionId: string,
  workflowRunId: string | null,
  blockers: string[]
): void {
  if (recordValue(value, 'workflow') !== 'official_codex_subagent') blockers.push(`proof_${label}_workflow_invalid`)
  if (firstText(recordValue(value, 'mission_id')) !== missionId) blockers.push(`proof_${label}_mission_identity_mismatch`)
  if (workflowRunId && firstText(recordValue(value, 'workflow_run_id')) !== workflowRunId) {
    blockers.push(`proof_${label}_run_identity_mismatch`)
  }
}

function validatePersistedEvidence(persisted: unknown, rebuilt: ReturnType<typeof buildSubagentEvidence> | null, blockers: string[]): void {
  if (!isRecord(persisted) || !rebuilt) return
  const scalarKeys = [
    'requested_subagents', 'count_policy', 'target_subagents', 'started_threads', 'completed_threads', 'failed_threads',
    'parent_summary_present', 'parent_summary_trustworthy', 'status', 'ok'
  ] as const
  for (const key of scalarKeys) {
    if (persisted[key] !== rebuilt[key]) blockers.push(`proof_evidence_rebuild_mismatch:${key}`)
  }
  const arrayKeys = [
    'started_thread_ids', 'completed_thread_ids', 'failed_thread_ids', 'open_thread_ids',
    'unmatched_stop_thread_ids', 'ambiguous_stop_thread_ids'
  ] as const
  for (const key of arrayKeys) {
    if (JSON.stringify(persisted[key]) !== JSON.stringify(rebuilt[key])) {
      blockers.push(`proof_evidence_rebuild_mismatch:${key}`)
    }
  }
}

function validateCountContractArtifacts(input: {
  persistedEvidence: unknown
  summary: unknown
  gate: unknown
  countPolicy: string
  targetSubagents: number
}, blockers: string[]): void {
  for (const [label, value] of [
    ['evidence', input.persistedEvidence],
    ['summary', input.summary],
    ['gate', input.gate]
  ] as const) {
    if (!isRecord(value)) continue
    if (value.count_policy !== input.countPolicy) blockers.push(`proof_${label}_count_policy_mismatch`)
    if (Number(value.target_subagents || 0) !== input.targetSubagents) blockers.push(`proof_${label}_target_subagents_mismatch`)
  }
}

function projectChangedFiles(value: unknown, blockers: string[]): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    blockers.push('proof_changed_files_invalid')
    return []
  }
  if (value.length > MAX_CHANGED_FILES) blockers.push('proof_changed_files_too_many')
  const result: string[] = []
  const seen = new Set<string>()
  for (const item of value.slice(0, MAX_CHANGED_FILES)) {
    if (typeof item !== 'string') {
      blockers.push('proof_changed_file_invalid')
      continue
    }
    const original = item.trim()
    if (!original || original.includes('\0') || original.length > MAX_CHANGED_FILE_CHARS) {
      blockers.push('proof_changed_file_invalid')
      continue
    }
    const slashPath = original.replace(/\\/g, '/')
    if (path.posix.isAbsolute(slashPath) || path.win32.isAbsolute(original)) {
      blockers.push('proof_changed_file_absolute')
      continue
    }
    const normalized = path.posix.normalize(slashPath).replace(/^\.\//, '')
    if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
      blockers.push('proof_changed_file_escape')
      continue
    }
    if (seen.has(normalized)) {
      blockers.push('proof_changed_file_duplicate')
      continue
    }
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function projectVerification(value: unknown, blockers: string[]): NarutoProofVerification[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    blockers.push('proof_verification_invalid')
    return []
  }
  if (value.length > MAX_VERIFICATION_ROWS) blockers.push('proof_verification_too_many')
  const result: NarutoProofVerification[] = []
  for (const row of value.slice(0, MAX_VERIFICATION_ROWS)) {
    const projected = projectVerificationRow(row)
    if (!projected) blockers.push('proof_verification_row_invalid')
    else result.push(projected)
  }
  return result
}

function projectVerificationRow(value: unknown): NarutoProofVerification | null {
  const rawName = typeof value === 'string'
    ? value
    : isRecord(value)
      ? firstText(value.name, value.check, value.command)
      : ''
  const name = rawName.trim()
  if (!name || name.length > MAX_VERIFICATION_NAME_CHARS || /[\r\n\0]/.test(name) || containsLeakageMarker(name)) return null
  const rawStatus = isRecord(value) ? firstText(value.status) : ''
  return { name, status: normalizeVerificationStatus(rawStatus, name) }
}

function normalizeVerificationStatus(value: string, name: string): NarutoProofVerification['status'] {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'passed' || normalized === 'pass' || normalized === 'ok' || normalized === 'verified') return 'passed'
  if (normalized === 'failed' || normalized === 'fail' || normalized === 'error') return 'failed'
  if (normalized === 'blocked') return 'blocked'
  if (normalized === 'skipped') return 'skipped'
  if (normalized === 'pending' || normalized === 'running') return 'pending'
  if (normalized === 'unknown' || normalized === 'unverified') return 'unknown'
  if (/\b(?:passed|pass|verified|green)\b|통과|완료/i.test(name)) return 'passed'
  if (/\b(?:failed|failure|error)\b|실패|오류/i.test(name)) return 'failed'
  if (/\bblocked\b|차단/i.test(name)) return 'blocked'
  if (/\b(?:pending|running)\b|보류|진행\s*중/i.test(name)) return 'pending'
  if (/\b(?:not run|unverified|unknown)\b|미실행|미검증/i.test(name)) return 'unknown'
  return 'reported'
}

function containsLeakageMarker(value: string): boolean {
  return /(?:^|\s)(?:prompt|system_prompt|user_prompt|stdout|stderr|environment|env_dump)\s*[:=]/i.test(value)
    || /\b(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]/i.test(value)
}

function isExplicitlyBlocked(input: {
  blockers: string[]
  parentStatus: string | null
  evidenceStatus: string
  failedThreads: number
  summaryStatus: string
  gate: unknown
}): boolean {
  if (input.parentStatus === 'blocked' || input.parentStatus === 'failed' || input.failedThreads > 0) return true
  if (/^(?:blocked|failed)$/i.test(input.evidenceStatus) || /^(?:blocked|failed)$/i.test(input.summaryStatus)) return true
  if (recordValue(input.gate, 'passed') === false && recordValue(input.gate, 'terminal') === true) return true
  return input.blockers.some((blocker) => !INCOMPLETE_BLOCKER_PATTERNS.some((pattern) => pattern.test(blocker)))
}

function gatePassed(value: unknown): boolean {
  return recordValue(value, 'passed') === true
    && recordValue(value, 'terminal') === true
    && firstText(recordValue(value, 'terminal_state')).toLowerCase() === 'completed'
    && arrayValue(recordValue(value, 'blockers')).length === 0
}

function fingerprintProof(input: {
  status: NarutoProofStatus
  missionId: string
  workflowRunId: string | null
  artifactHashes: NarutoProofArtifactSnapshot['byte_hashes']
  result: NarutoProofResult
}): string {
  const artifactHashes = NARUTO_PROOF_ARTIFACT_FILENAMES.map((filename) => [filename, input.artifactHashes[filename]])
  const stableInput = {
    schema: NARUTO_RESULT_SCHEMA,
    action: 'proof',
    status: input.status,
    mission_id: input.missionId,
    workflow: 'official_codex_subagent',
    workflow_run_id: input.workflowRunId,
    artifact_byte_sha256: artifactHashes,
    result: input.result
  }
  return `sha256:${sha256(JSON.stringify(stableInput))}`
}

function recordValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function positiveInteger(value: unknown): number | null {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

function uniqueStrings(values: readonly unknown[]): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
}
