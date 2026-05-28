import fs from 'node:fs'
import path from 'node:path'
import { nowIso, sha256, writeJsonAtomic } from '../fsx.js'
import { detectAppshotsCapability, type AppshotsCapability, type AppshotsThreadAttachmentMetadata } from '../codex/appshots-detector.js'
import { buildAppshotsOperatorPolicy, type AppshotsOperatorPolicy } from '../codex/appshots-operator-policy.js'

export const APPSHOTS_EVIDENCE_SCHEMA = 'sks.appshots-source-intelligence-evidence.v1'

export interface AppshotsEvidence {
  schema: typeof APPSHOTS_EVIDENCE_SCHEMA
  generated_at: string
  ok: boolean
  status: 'not_required' | 'operator_required' | 'recorded'
  proof_level: 'not_required' | 'operator_required' | 'fixture_instrumented_real' | 'proven' | 'blocked'
  capability: AppshotsCapability
  operator_policy: AppshotsOperatorPolicy
  source_paths: string[]
  accepted_source_paths: string[]
  source_verification: AppshotsSourceVerification[]
  thread_attachment_discovery: AppshotsCapability['thread_attachment_discovery']
  source_count: number
  privacy_safety_ok: boolean
  triwiki_voxel_ready: boolean
  blockers: string[]
  warnings: string[]
}

export interface AppshotsSourceMetadata {
  path: string
  source_type?: 'codex_appshot' | 'screenshot' | 'text' | 'unknown'
  origin?: 'codex_app' | 'fixture' | 'unknown'
  operator_attached?: boolean
  frontmost_window?: boolean
  redacted?: boolean
  local_only?: boolean
  fixture?: boolean
  thread_id?: string | null
  attachment_id?: string | null
  source_app?: string | null
  source_window?: string | null
}

export interface AppshotsSourceVerification {
  path: string
  exists: boolean
  source_type: string
  operator_attached: boolean
  frontmost_window: boolean
  redacted: boolean
  local_only: boolean
  fixture: boolean
  thread_id: string | null
  attachment_id: string | null
  source_app: string | null
  source_window: string | null
  sha256: string | null
  accepted: boolean
  blockers: string[]
}

export function buildAppshotsEvidence(input: {
  root?: string
  prompt?: string
  visualRequired?: boolean
  sourcePaths?: string[]
  sourceMetadata?: AppshotsSourceMetadata[]
  threadAttachments?: AppshotsThreadAttachmentMetadata[]
  operatorActionRecorded?: boolean
  appshotsToolAvailable?: boolean
} = {}): AppshotsEvidence {
  const root = path.resolve(input.root || process.cwd())
  const sourcePaths = (input.sourcePaths || []).map(String).filter(Boolean)
  const sourceVerification = sourcePaths.map((sourcePath) => verifySource(root, sourcePath, input.sourceMetadata || []))
  const acceptedSourcePaths = sourceVerification.filter((row) => row.accepted).map((row) => row.path)
  const operatorActionRecorded = input.operatorActionRecorded === true && acceptedSourcePaths.length > 0
  const capability = detectAppshotsCapability({
    prompt: input.prompt || '',
    ...(input.visualRequired === undefined ? {} : { visualRequired: input.visualRequired }),
    operatorActionRecorded,
    ...(input.appshotsToolAvailable === undefined ? {} : { appshotsToolAvailable: input.appshotsToolAvailable }),
    ...(input.threadAttachments === undefined ? {} : { threadAttachments: input.threadAttachments })
  })
  const operatorPolicy = buildAppshotsOperatorPolicy(capability, { operatorActionRecorded, sourcePaths: acceptedSourcePaths })
  const visualRequired = capability.visual_required
  const sourceBlockers = visualRequired ? sourceVerification.flatMap((row) => row.blockers) : []
  const blockers = [...capability.blockers, ...operatorPolicy.blockers, ...sourceBlockers]
  const privacySafetyOk = !visualRequired || (acceptedSourcePaths.length > 0 && sourceVerification.every((row) => row.accepted ? row.redacted && row.local_only : true))
  const triwikiReady = !visualRequired || acceptedSourcePaths.length > 0
  const proofLevel = !visualRequired
    ? 'not_required'
    : blockers.length > 0
      ? 'blocked'
      : sourceVerification.some((row) => row.accepted && row.fixture)
        ? 'fixture_instrumented_real'
        : 'proven'
  return {
    schema: APPSHOTS_EVIDENCE_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0 && privacySafetyOk && triwikiReady,
    status: visualRequired ? operatorActionRecorded ? 'recorded' : 'operator_required' : 'not_required',
    proof_level: proofLevel,
    capability,
    operator_policy: operatorPolicy,
    source_paths: sourcePaths,
    accepted_source_paths: acceptedSourcePaths,
    source_verification: sourceVerification,
    thread_attachment_discovery: capability.thread_attachment_discovery,
    source_count: acceptedSourcePaths.length,
    privacy_safety_ok: privacySafetyOk && operatorPolicy.privacy_safety.redact_sensitive_text && operatorPolicy.privacy_safety.avoid_secrets_and_credentials,
    triwiki_voxel_ready: triwikiReady,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(operatorPolicy.warnings)]
  }
}

export async function writeAppshotsEvidenceArtifact(root: string, evidence: AppshotsEvidence) {
  await writeJsonAtomic(path.join(root, 'appshots-evidence.json'), evidence)
  await writeJsonAtomic(path.join(root, 'appshots-operator-policy.json'), evidence.operator_policy)
  await writeJsonAtomic(path.join(root, 'appshots-capability.json'), evidence.capability)
  await writeJsonAtomic(path.join(root, 'appshots-privacy-safety.json'), {
    schema: 'sks.appshots-privacy-safety.v1',
    generated_at: evidence.generated_at,
    ok: evidence.privacy_safety_ok,
    privacy_safety: evidence.operator_policy.privacy_safety,
    blockers: evidence.privacy_safety_ok ? [] : ['appshots_privacy_policy_not_satisfied']
  })
  await writeJsonAtomic(path.join(root, 'appshots-triwiki-voxel.json'), {
    schema: 'sks.appshots-triwiki-voxel.v1',
    generated_at: evidence.generated_at,
    ok: evidence.triwiki_voxel_ready,
    source_paths: evidence.accepted_source_paths,
    source_verification: evidence.source_verification,
    thread_attachment_discovery: evidence.thread_attachment_discovery,
    status: evidence.triwiki_voxel_ready ? 'ready' : 'operator_required',
    blockers: evidence.triwiki_voxel_ready ? [] : ['appshots_source_missing_for_visual_voxel']
  })
  return evidence
}

function verifySource(root: string, sourcePath: string, metadata: AppshotsSourceMetadata[]): AppshotsSourceVerification {
  const normalizedPath = normalizeSourcePath(sourcePath)
  const absolute = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(root, normalizedPath)
  const meta = metadata.find((item) => normalizeSourcePath(item.path) === normalizedPath || path.resolve(root, normalizeSourcePath(item.path)) === absolute)
  const exists = fs.existsSync(absolute) && fs.statSync(absolute).isFile()
  const sourceType = String(meta?.source_type || 'unknown')
  const operatorAttached = meta?.operator_attached === true
  const frontmostWindow = meta?.frontmost_window === true
  const redacted = meta?.redacted === true
  const localOnly = meta?.local_only === true
  const fixture = meta?.fixture === true || meta?.origin === 'fixture'
  const threadId = stringOrNull(meta?.thread_id)
  const attachmentId = stringOrNull(meta?.attachment_id)
  const sourceApp = stringOrNull(meta?.source_app)
  const sourceWindow = stringOrNull(meta?.source_window)
  const blockers = [
    ...(exists ? [] : [`appshots_source_missing:${normalizedPath}`]),
    ...(sourceType === 'codex_appshot' ? [] : [`appshots_source_type_unverified:${normalizedPath}`]),
    ...(operatorAttached ? [] : [`appshots_operator_attachment_unverified:${normalizedPath}`]),
    ...(frontmostWindow ? [] : [`appshots_frontmost_window_unverified:${normalizedPath}`]),
    ...(redacted ? [] : [`appshots_redaction_unverified:${normalizedPath}`]),
    ...(localOnly ? [] : [`appshots_local_only_unverified:${normalizedPath}`]),
    ...(sourceType === 'codex_appshot' && !threadId ? [`appshots_thread_id_missing:${normalizedPath}`] : []),
    ...(sourceType === 'codex_appshot' && !attachmentId ? [`appshots_attachment_id_missing:${normalizedPath}`] : [])
  ]
  return {
    path: normalizedPath,
    exists,
    source_type: sourceType,
    operator_attached: operatorAttached,
    frontmost_window: frontmostWindow,
    redacted,
    local_only: localOnly,
    fixture,
    thread_id: threadId,
    attachment_id: attachmentId,
    source_app: sourceApp,
    source_window: sourceWindow,
    sha256: exists ? sha256(fs.readFileSync(absolute)) : null,
    accepted: blockers.length === 0,
    blockers
  }
}

function normalizeSourcePath(sourcePath: string) {
  return String(sourcePath || '').replace(/\\/g, '/').replace(/^\.\/+/, '')
}

function stringOrNull(value?: string | null): string | null {
  const text = String(value || '').trim()
  return text || null
}
