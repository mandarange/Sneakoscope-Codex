import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { readMacosMenubarProof, validateMacosMenubarProofArtifacts } from './macos-menubar-proof.js'
import { releaseProofDir, validateLocalReleasePackBinding } from './release-pack-receipt.js'
import { validateFullReleaseStamp } from './release-stamp-proof.js'
import { releaseOriginIdentity } from './release-origin.js'
import { evaluateOfficialSubagentExecutionProof } from '../proof/fake-real-proof-policy.js'
import { buildSubagentEvidence } from '../subagents/subagent-evidence.js'
import { validateSsotGuardArtifact } from '../safety/ssot-guard.js'
import { validateWorkOrderLedger } from '../artifact-schemas.js'

export const MAIN_PUSH_GUARD_SCHEMA = 'sks.release-main-push-guard.v1'
export const RELEASE_CLOSURE_SCHEMA = 'sks.release-closure.v1'
export const RELEASE_CLOSURE_MANIFEST_SCHEMA = 'sks.release-closure-manifest.v1'
export const RELEASE_630_MISSION_ID = 'M-20260715-150100-34bb'

const FINDING_PROOF_SCHEMA = 'sks.release-finding-proof.v1'
const LIFECYCLE_PROVENANCE_SCHEMA = 'sks.codex-rollout-event-proof.v1'
const DELETION_COUNTING_SEMANTICS = 'git_diff_deleted_files_numstat_v1'
const SLICE_HASH_SEMANTICS = 'utf8_lf_lines_with_terminal_lf_v1'
const HEAD_BINDING_MODE = 'tracked_manifest_git_blob_at_head_v1'
const FINDING_STATUSES = ['fixed', 'not_reproducible_with_evidence', 'accepted_risk_with_expiry', 'deferred_because_out_of_scope']
const P0_FINDING_STATUSES = new Set(['fixed', 'not_reproducible_with_evidence'])
const FINDING_IDS = Array.from({ length: 28 }, (_, index) => `F-${String(index + 1).padStart(3, '0')}`)
const WORK_ORDER_IDS = Array.from({ length: 28 }, (_, index) => `WO-${String(index).padStart(3, '0')}`)
const P0 = new Set(['F-001', 'F-002', 'F-003', 'F-006', 'F-009', 'F-013', 'F-015', 'F-018', 'F-019', 'F-020', 'F-025', 'F-027'])
const P2 = new Set(['F-017', 'F-023'])
const WORK_ORDER_SHA256 = '601bb141c9365c541a0abf3f361c2bafbd7b5a7c80557bccb8dd1dedaa12aa11'
const POST_MAIN_WORK_ORDERS = new Set(['WO-002', 'WO-019', 'WO-020', 'WO-022', 'WO-023', 'WO-026'])
const REQUIRED_ARTIFACTS = {
  findings: { path: (version: string) => `.sneakoscope/release/${version}/audit/findings.json`, schema: 'sks.release-findings.v1' },
  deletion: { path: (version: string) => `.sneakoscope/release/${version}/audit/overengineering-deletions.json`, schema: 'sks.release-overengineering-deletions.v1' },
  mission: { path: (_version: string, mission: string) => `.sneakoscope/missions/${mission}/mission.json`, schema: null },
  plan: { path: (_version: string, mission: string) => `.sneakoscope/missions/${mission}/subagent-plan.json`, schema: 'sks.subagent-plan.v1' },
  events: { path: (_version: string, mission: string) => `.sneakoscope/missions/${mission}/subagent-events.jsonl`, schema: 'sks.subagent-event-log.v1' },
  parent_summary: { path: (_version: string, mission: string) => `.sneakoscope/missions/${mission}/subagent-parent-summary.json`, schema: 'sks.subagent-parent-summary.v1' },
  evidence: { path: (_version: string, mission: string) => `.sneakoscope/missions/${mission}/subagent-evidence.json`, schema: 'sks.subagent-evidence.v1' },
  summary: { path: (_version: string, mission: string) => `.sneakoscope/missions/${mission}/naruto-summary.json`, schema: 'sks.naruto-subagent-workflow.v1' },
  gate: { path: (_version: string, mission: string) => `.sneakoscope/missions/${mission}/naruto-gate.json`, schema: 'sks.naruto-gate.v1' },
  ssot: { path: (_version: string, mission: string) => `.sneakoscope/missions/${mission}/ssot-guard.json`, schema: 'sks.ssot-guard.v1' },
  ledger: { path: (_version: string, mission: string) => `.sneakoscope/missions/${mission}/work-order-ledger.json`, schema: null }
} as const

export interface MainPushGuardInput {
  root: string
  expectedVersion: string
  expectedOriginMain: string
  expectedOriginIdentity: string
  requireReleaseStamp?: boolean
  requirePackProof?: boolean
  requireMacosProof?: boolean
  requireCleanTree?: boolean
  expectedReleaseMissionId?: string
  expectedWorkOrderSha256?: string
}

export interface ReleaseClosureInput {
  root: string
  version: string
  expectedHead: string
  expectedBaseline: string
  expectedMissionId?: string
  expectedWorkOrderSha256?: string
}

export function releaseClosureManifestPath(root: string, version: string) {
  return path.join(root, '.sneakoscope', 'release', version, 'release-closure.json')
}

export function inspectMainPushGuard(input: MainPushGuardInput) {
  const blockers: string[] = []
  const pkg = readJson(path.join(input.root, 'package.json')) || {}
  const head = gitText(input.root, ['rev-parse', 'HEAD'])
  const originMain = gitText(input.root, ['rev-parse', 'origin/main'])
  const origin = releaseOriginIdentity(input.root)
  if (!head) blockers.push('head_sha_unavailable')
  if (originMain !== input.expectedOriginMain) blockers.push(`origin_main_mismatch:${originMain || 'missing'}`)
  if (!origin.identity || origin.identity !== input.expectedOriginIdentity) blockers.push(`origin_identity_mismatch:${origin.identity || 'missing'}`)
  if (pkg.version !== input.expectedVersion) blockers.push(`package_version_mismatch:${String(pkg.version || 'missing')}`)
  if (!gitOk(input.root, ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'])) blockers.push('origin_main_not_ancestor_of_head')
  if (input.requireCleanTree && gitText(input.root, ['status', '--porcelain=v1'])) blockers.push('worktree_not_clean')

  const closure = inspectReleaseClosure({
    root: input.root,
    version: input.expectedVersion,
    expectedHead: head,
    expectedBaseline: input.expectedOriginMain,
    expectedMissionId: input.expectedReleaseMissionId || RELEASE_630_MISSION_ID,
    ...(input.expectedWorkOrderSha256 === undefined ? {} : { expectedWorkOrderSha256: input.expectedWorkOrderSha256 })
  })
  blockers.push(...closure.blockers.map((blocker) => `release_closure:${blocker}`))

  const proofDir = releaseProofDir(input.root, input.expectedVersion)
  if (input.requireReleaseStamp !== true) blockers.push('release_stamp_requirement_missing')
  if (input.requireReleaseStamp) {
    const validation = validateFullReleaseStamp({
      root: input.root,
      stampFile: path.join(input.root, '.sneakoscope', 'reports', 'release-check-stamp.json'),
      expectedVersion: input.expectedVersion,
      expectedHead: head
    })
    if (!validation.ok) blockers.push(...validation.blockers)
  }

  const pack = readJson(path.join(proofDir, 'pack-receipt.json'))
  if (input.requirePackProof !== true) blockers.push('pack_proof_requirement_missing')
  if (input.requirePackProof) {
    const validation = validateLocalReleasePackBinding(input.root, pack)
    if (!validation.ok) blockers.push('pack_receipt_missing_or_invalid', ...validation.blockers.map((blocker) => `pack_receipt:${blocker}`))
    if (pack?.package_version !== input.expectedVersion) blockers.push('pack_receipt_version_mismatch')
    if (head && pack?.source_commit !== head) blockers.push('pack_receipt_source_commit_mismatch')
  }

  const macos = readMacosMenubarProof(input.root, input.expectedVersion)
  if (input.requireMacosProof !== true) blockers.push('macos_proof_requirement_missing')
  if (input.requireMacosProof) blockers.push(...validateMacosMenubarProofArtifacts(input.root, macos, {
    version: input.expectedVersion,
    ...(head ? { sourceCommit: head } : {})
  }).blockers)

  if (input.requireCleanTree !== true) blockers.push('clean_tree_requirement_missing')
  return {
    schema: MAIN_PUSH_GUARD_SCHEMA,
    ok: blockers.length === 0,
    expected_version: input.expectedVersion,
    expected_origin_main: input.expectedOriginMain,
    expected_origin_identity: input.expectedOriginIdentity,
    actual_origin_identity: origin.identity || null,
    actual_origin_url: origin.url || null,
    actual_origin_main: originMain || null,
    head: head || null,
    release_stamp: input.requireReleaseStamp ? path.join('.sneakoscope', 'reports', 'release-check-stamp.json') : null,
    pack_proof: input.requirePackProof ? path.relative(input.root, path.join(proofDir, 'pack-receipt.json')) : null,
    macos_proof: input.requireMacosProof ? path.relative(input.root, path.join(proofDir, 'macos-menubar-proof.json')) : null,
    release_closure: closure,
    force_push_allowed: false,
    blockers: unique(blockers),
    checked_at: new Date().toISOString()
  }
}

export function inspectReleaseClosure(input: ReleaseClosureInput) {
  const blockers: string[] = []
  const expectedMissionId = input.expectedMissionId || RELEASE_630_MISSION_ID
  const manifestFile = releaseClosureManifestPath(input.root, input.version)
  const manifestRel = relative(input.root, manifestFile)
  const manifest = readJson(manifestFile)
  const expectedWorkOrderSha256 = input.expectedWorkOrderSha256 || WORK_ORDER_SHA256

  if (input.version !== '6.3.0') blockers.push(`contract_unsupported:${input.version || 'missing'}`)
  if (!sha40(input.expectedBaseline)) blockers.push('expected_baseline_invalid')
  if (!sha40(input.expectedHead)) blockers.push('expected_head_invalid')
  if (!manifest || manifest.schema !== RELEASE_CLOSURE_MANIFEST_SCHEMA) blockers.push('closure_manifest_missing_or_invalid')
  if (manifest?.version !== input.version) blockers.push('closure_manifest_version_mismatch')
  if (manifest?.baseline !== input.expectedBaseline) blockers.push('closure_manifest_baseline_mismatch')
  if (manifest?.mission_id !== expectedMissionId) blockers.push(`mission_id_mismatch:${String(manifest?.mission_id || 'missing')}`)
  if (manifest?.head_binding !== HEAD_BINDING_MODE) blockers.push('closure_manifest_head_binding_invalid')
  const sourceCommit = String(manifest?.source_commit || '')
  if (!sourceCommitBound(input.root, sourceCommit, input.expectedBaseline, input.expectedHead)) blockers.push('closure_source_commit_unbound')
  validatePostSourceCommitDiff(input.root, sourceCommit, input.expectedHead, input.version, blockers)

  const manifestHash = fileSha256(manifestFile)
  if (!manifestHash) blockers.push('closure_manifest_hash_unavailable')
  if (!trackedBlobMatches(input.root, input.expectedHead, manifestRel, manifestHash)) blockers.push('closure_manifest_not_exact_head_blob')

  const paths = requiredArtifactPaths(input.version, expectedMissionId)
  for (const [key, spec] of Object.entries(paths)) {
    const entry = manifest?.artifacts?.[key]
    if (!entry || entry.path !== spec.path || !sha256(entry.sha256) || !positiveLineCount(entry.line_count)) {
      blockers.push(`closure_artifact_manifest_invalid:${key}`)
      continue
    }
    const artifactFile = path.join(input.root, spec.path)
    const actual = fileSha256(artifactFile)
    const actualLineCount = fileLineCount(artifactFile)
    if (!actual || actual !== entry.sha256) blockers.push(`closure_artifact_hash_mismatch:${key}`)
    if (actualLineCount !== entry.line_count) blockers.push(`closure_artifact_line_count_mismatch:${key}`)
    if (entry.schema !== spec.schema) blockers.push(`closure_artifact_schema_contract_mismatch:${key}`)
    if (spec.schema && key !== 'events') {
      const artifact = readJson(artifactFile)
      if (artifact?.schema !== spec.schema) blockers.push(`closure_artifact_schema_invalid:${key}`)
    }
    if ((key === 'findings' || key === 'deletion')
      && !trackedBlobMatches(input.root, input.expectedHead, spec.path, actual)) blockers.push(`closure_artifact_not_exact_head_blob:${key}`)
  }
  if (!sameSet(Object.keys(manifest?.artifacts || {}), Object.keys(paths))) blockers.push('closure_artifact_set_invalid')

  const findings = readJson(path.join(input.root, paths.findings.path))
  validateFindings(input.root, findings, manifest, sourceCommit, expectedMissionId, input.expectedBaseline, blockers)

  const mission = readJson(path.join(input.root, paths.mission.path))
  validateMission(mission, sourceCommit, expectedMissionId, blockers)
  const plan = readJson(path.join(input.root, paths.plan.path))
  const rawEvents = readJsonl(path.join(input.root, paths.events.path))
  const parent = readJson(path.join(input.root, paths.parent_summary.path))
  const evidence = readJson(path.join(input.root, paths.evidence.path))
  const summary = readJson(path.join(input.root, paths.summary.path))
  const gate = readJson(path.join(input.root, paths.gate.path))
  const ssot = readJson(path.join(input.root, paths.ssot.path))
  validateOfficialThreads(input.root, { plan, rawEvents, parent, evidence, summary, gate, ssot, missionId: expectedMissionId }, blockers)

  const ledger = readJson(path.join(input.root, paths.ledger.path))
  validateReleaseLedger(input.root, ledger, manifest, sourceCommit, expectedMissionId, expectedWorkOrderSha256, blockers)

  const deletion = readJson(path.join(input.root, paths.deletion.path))
  validateDeletion(input.root, deletion, manifest, sourceCommit, input.expectedBaseline, blockers)

  return {
    schema: RELEASE_CLOSURE_SCHEMA,
    ok: blockers.length === 0,
    version: input.version,
    head: sha40(input.expectedHead) ? input.expectedHead : null,
    source_commit: sha40(sourceCommit) ? sourceCommit : null,
    mission_id: expectedMissionId,
    manifest_path: manifestRel,
    manifest_sha256: manifestHash,
    blockers: unique(blockers)
  }
}

export function buildReleaseClosureManifest(input: {
  root: string
  version: string
  baseline: string
  sourceCommit: string
  missionId?: string
}) {
  const missionId = input.missionId || RELEASE_630_MISSION_ID
  const paths = requiredArtifactPaths(input.version, missionId)
  const artifacts: Record<string, { path: string; sha256: string | null; line_count: number | null; schema: string | null }> = {}
  for (const [key, spec] of Object.entries(paths)) {
    const artifactFile = path.join(input.root, spec.path)
    artifacts[key] = {
      path: spec.path,
      sha256: fileSha256(artifactFile),
      line_count: fileLineCount(artifactFile),
      schema: spec.schema
    }
  }
  const findings = readJson(path.join(input.root, paths.findings.path))
  const ledger = readJson(path.join(input.root, paths.ledger.path))
  const attachment = attachmentTruth(ledger)
  const deletion = deletionTruth(input.root, input.baseline, input.sourceCommit)
  return {
    schema: RELEASE_CLOSURE_MANIFEST_SCHEMA,
    version: input.version,
    baseline: input.baseline,
    source_commit: input.sourceCommit,
    mission_id: missionId,
    head_binding: HEAD_BINDING_MODE,
    artifacts,
    finding_proofs: flattenFindingProofs(findings),
    work_order_evidence: flattenWorkOrderEvidence(ledger),
    source_attachment: attachment.ok ? attachment.manifest : null,
    deletion_truth: deletion.ok ? deletion.manifest : null,
    generated_at: new Date().toISOString()
  }
}

export function writeReleaseClosureManifest(input: {
  root: string
  version: string
  baseline: string
  sourceCommit: string
  missionId?: string
}) {
  const output = releaseClosureManifestPath(input.root, input.version)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(buildReleaseClosureManifest(input), null, 2)}\n`)
  return output
}

function validateFindings(root: string, findings: any, manifest: any, sourceCommit: string, missionId: string, baseline: string, blockers: string[]) {
  if (!findings || findings.schema !== 'sks.release-findings.v1' || findings.captured_before_product_implementation !== true) blockers.push('findings_missing_or_invalid')
  if (findings?.baseline !== baseline) blockers.push('findings_baseline_mismatch')
  if (findings?.source_commit !== sourceCommit) blockers.push('findings_source_commit_mismatch')
  if (findings?.mission_id !== missionId) blockers.push('findings_mission_id_mismatch')
  if (!sameSet(findings?.allowed_terminal_statuses, FINDING_STATUSES)) blockers.push('finding_status_contract_invalid')
  const rows: any[] = Array.isArray(findings?.findings) ? findings.findings : []
  if (rows.length !== 28) blockers.push(`finding_count_mismatch:${rows.length}/28`)
  if (!sameSet(rows.map((row) => row?.id), FINDING_IDS)) blockers.push('finding_ids_invalid')
  const manifestProofs = Array.isArray(manifest?.finding_proofs) ? manifest.finding_proofs : []
  const observedProofs: any[] = []
  for (const row of rows) {
    const id = String(row?.id || '')
    const severity = P0.has(id) ? 'P0' : P2.has(id) ? 'P2' : 'P1'
    if (row?.severity !== severity) blockers.push(`finding_severity_mismatch:${id}`)
    if (!FINDING_STATUSES.includes(row?.status)) blockers.push(`finding_not_terminal:${id}`)
    if (severity === 'P0' && !P0_FINDING_STATUSES.has(row?.status)) blockers.push(`p0_terminal_status_forbidden:${id}`)
    if (row?.status === 'accepted_risk_with_expiry' && !acceptedRiskComplete(row?.accepted_risk)) blockers.push(`accepted_risk_incomplete:${id}`)
    if (row?.closure?.commit !== sourceCommit) blockers.push(`finding_commit_unbound:${id}`)
    const proofEntries = Array.isArray(row?.closure?.proof) ? row.closure.proof : []
    if (!proofEntries.length) blockers.push(`finding_proof_invalid:${id}`)
    for (const entry of proofEntries) {
      observedProofs.push({ finding_id: id, path: entry?.path, sha256: entry?.sha256, line_count: entry?.line_count })
      validateEvidenceFile(root, entry, {
        schema: FINDING_PROOF_SCHEMA,
        sourceCommit,
        missionId,
        findingId: id,
        findingStatus: row?.status
      }, `finding_proof:${id}`, blockers)
    }
  }
  if (!sameJsonSet(observedProofs, manifestProofs, findingProofKey)) blockers.push('finding_proof_manifest_mismatch')
}

function validateMission(mission: any, sourceCommit: string, missionId: string, blockers: string[]) {
  if (!mission || mission.id !== missionId || String(mission.mode || '').toLowerCase() !== 'naruto') blockers.push('mission_identity_invalid')
  if (mission?.implementation_allowed !== true) blockers.push('mission_implementation_not_allowed')
  if (mission?.phase !== 'NARUTO_COMPLETE') blockers.push('mission_not_complete')
  if (mission?.completion?.status !== 'completed' || mission?.completion?.mission_id !== missionId || mission?.completion?.source_commit !== sourceCommit) {
    blockers.push('mission_completion_binding_invalid')
  }
}

function validateOfficialThreads(root: string, value: any, blockers: string[]) {
  const { plan, rawEvents, parent, evidence, summary, gate, ssot, missionId } = value
  const runId = String(plan?.workflow_run_id || '')
  const slices: any[] = Array.isArray(plan?.slices) ? plan.slices : []
  if (plan?.schema !== 'sks.subagent-plan.v1' || plan?.mission_id !== missionId || plan?.route !== '$Naruto'
    || plan?.workflow !== 'official_codex_subagent' || plan?.requested_subagents !== 3 || plan?.max_depth !== 1) blockers.push('subagent_plan_invalid')
  if (slices.length !== 3 || new Set(slices.map((slice) => slice?.id)).size !== 3) blockers.push('subagent_plan_slices_invalid')
  if (slices.some((slice) => !text(slice?.id) || !text(slice?.title) || !text(slice?.description) || !text(slice?.agent)
    || !text(slice?.thread_id) || !text(slice?.agent_path) || !plan?.agents?.[slice.agent])) blockers.push('subagent_plan_roles_invalid')
  if (plan?.parent_model_match !== true || !text(plan?.observed_parent_model)) blockers.push('subagent_parent_model_unproven')

  const events = Array.isArray(rawEvents) ? rawEvents : []
  if (events.length !== 6) blockers.push(`subagent_event_count_invalid:${events.length}/6`)
  const starts = events.filter((event) => event?.event_name === 'SubagentStart')
  const stops = events.filter((event) => event?.event_name === 'SubagentStop')
  const startIds = strings(starts.map((event) => event?.thread_id)).sort()
  const stopIds = strings(stops.map((event) => event?.thread_id)).sort()
  if (starts.length !== 3 || stops.length !== 3 || !sameSet(startIds, stopIds) || new Set(startIds).size !== 3) blockers.push('subagent_lifecycle_pairing_invalid')
  const sliceThreadIds = strings(slices.map((slice) => slice?.thread_id)).sort()
  if (!sameSet(startIds, sliceThreadIds)) blockers.push('subagent_plan_thread_ids_mismatch')
  const startPathByThread = new Map(starts.map((event) => [event?.thread_id, event?.provenance?.agent_path]))
  for (const event of events) {
    if (event?.schema !== 'sks.subagent-event.v1' || event?.run_id !== runId || !text(event?.thread_id) || !text(event?.occurred_at)) {
      blockers.push(`subagent_event_invalid:${String(event?.thread_id || 'missing')}`)
      continue
    }
    const expectedPath = event?.event_name === 'SubagentStop' ? startPathByThread.get(event.thread_id) : event?.provenance?.agent_path
    validateRolloutProvenance(root, event, expectedPath, blockers)
  }
  for (const slice of slices) {
    if (startPathByThread.get(slice.thread_id) !== slice.agent_path) blockers.push(`subagent_plan_agent_path_mismatch:${slice.id}`)
  }

  const official = evaluateOfficialSubagentExecutionProof({ subagent_plan: plan, subagent_evidence: evidence, naruto_summary: summary, naruto_gate: gate }, { required: true })
  if (official.proof_level !== 'proven') blockers.push(...official.blockers.map((item) => `naruto:${item}`))
  const rebuilt = buildSubagentEvidence({
    requestedSubagents: 3,
    events,
    parentSummary: parent,
    parentSummaryPresent: Boolean(parent),
    workflowStatus: 'completed',
    preparationOnly: false,
    runId
  })
  const evidenceKeys = [
    'ok', 'status', 'preparation_only', 'requested_subagents', 'started_threads', 'completed_threads', 'failed_threads',
    'started_thread_ids', 'completed_thread_ids', 'failed_thread_ids', 'open_thread_ids', 'unmatched_stop_thread_ids',
    'ambiguous_stop_thread_ids', 'event_sources', 'parent_summary_present', 'parent_summary_trustworthy',
    'parent_summary_status', 'run_id', 'blockers'
  ]
  if (!rebuilt.ok || evidenceKeys.some((key) => JSON.stringify((rebuilt as any)[key]) !== JSON.stringify(evidence?.[key]))) blockers.push('subagent_evidence_recompute_mismatch')

  const parentIds = strings((parent?.thread_outcomes || []).map((row: any) => row?.thread_id)).sort()
  if (parent?.schema !== 'sks.subagent-parent-summary.v1' || parent?.status !== 'completed' || parent?.run_id !== runId
    || !parent?.changed_files?.length || !parent?.verification?.length || (parent?.blockers || []).length
    || parent?.thread_outcomes?.length !== 3 || !sameSet(parentIds, startIds)
    || parent.thread_outcomes.some((row: any) => row?.status !== 'completed' || !text(row?.summary))) blockers.push('parent_summary_invalid')
  if (summary?.mission_id !== missionId || summary?.workflow_run_id !== runId || summary?.requested_subagents !== 3
    || summary?.ok !== true || summary?.completion_evidence !== true || summary?.status !== 'completed'
    || summary?.parent_summary_present !== true || !sameSet(strings((summary?.parent_thread_outcomes || []).map((row: any) => row?.thread_id)), startIds)) blockers.push('naruto_summary_inconsistent')
  if (gate?.mission_id !== missionId || gate?.workflow_run_id !== runId || gate?.requested_subagents !== 3
    || gate?.started_subagents !== 3 || gate?.completed_subagents !== 3 || gate?.failed_subagents !== 0
    || gate?.passed !== true || gate?.terminal !== true || gate?.terminal_state !== 'completed'
    || gate?.official_subagent_evidence !== true || gate?.subagent_evidence_ready !== true
    || gate?.parent_summary_present !== true || gate?.session_cleanup !== true || gate?.ssot_guard !== true
    || (gate?.blockers || []).length) blockers.push('naruto_gate_inconsistent')
  if (!validateSsotGuardArtifact(ssot).ok) blockers.push('ssot_guard_invalid')
}

function validateReleaseLedger(root: string, ledger: any, manifest: any, sourceCommit: string, missionId: string, expectedSha: string, blockers: string[]) {
  const items: any[] = Array.isArray(ledger?.items) ? ledger.items : []
  const hasBlockedItems = items.some((item) => item?.status === 'blocked')
  if (!validateWorkOrderLedger(ledger || {}).ok || ledger?.schema_version !== 1 || ledger?.mission_id !== missionId
    || String(ledger?.route || '').replace(/^\$/, '').toLowerCase() !== 'naruto'
    || ledger?.source_sha256 !== expectedSha || ledger?.source_line_count !== 3021 || ledger?.source_commit !== sourceCommit
    || ledger?.source_inventory_complete !== true || ledger?.all_customer_requests_preserved !== true
    || ledger?.all_customer_requests_mapped !== true || ledger?.all_work_items_resolved !== true
    || ledger?.all_work_items_verified !== !hasBlockedItems) blockers.push('work_order_header_invalid')
  if (items.length !== 28) blockers.push(`work_order_count_mismatch:${items.length}/28`)
  if (!sameSet(items.map((item) => item?.id), WORK_ORDER_IDS)) blockers.push('work_order_ids_invalid')

  const observedEvidence: any[] = []
  for (const item of items) {
    const id = String(item?.id || 'missing')
    const blocked = item?.status === 'blocked' && POST_MAIN_WORK_ORDERS.has(id) && item?.blocker?.blocked === true
      && item?.blocker?.kind === 'external_authority' && item?.blocker?.phase === 'post_main'
      && text(item?.blocker?.reason) && text(item?.blocker?.needed_to_unblock)
    if (item?.status !== 'verified' && !blocked) blockers.push(`work_order_item_invalid:${id}`)
    const implementation = Array.isArray(item?.implementation_evidence) ? item.implementation_evidence : []
    const verification = Array.isArray(item?.verification_evidence) ? item.verification_evidence : []
    if (!implementation.length) blockers.push(`work_order_implementation_evidence_missing:${id}`)
    if (item?.status === 'verified' && !verification.length) blockers.push(`work_order_verification_evidence_missing:${id}`)
    for (const [kind, entries] of [['implementation', implementation], ['verification', verification]] as const) {
      for (const entry of entries) {
        observedEvidence.push({ work_order_id: id, kind, path: entry?.path, sha256: entry?.sha256, line_count: entry?.line_count })
        validateEvidenceFile(root, entry, { sourceCommit, missionId, workOrderId: id, evidenceKind: kind }, `work_order_${kind}:${id}`, blockers)
      }
    }
  }
  if (!sameJsonSet(observedEvidence, manifest?.work_order_evidence || [], workOrderEvidenceKey)) blockers.push('work_order_evidence_manifest_mismatch')

  const attachment = attachmentTruth(ledger)
  if (!attachment.ok) blockers.push(...attachment.blockers)
  else {
    if (attachment.manifest.sha256 !== expectedSha || attachment.manifest.line_count !== 3021) blockers.push('work_order_attachment_identity_mismatch')
    if (JSON.stringify(attachment.manifest) !== JSON.stringify(manifest?.source_attachment)) blockers.push('work_order_attachment_manifest_mismatch')
  }
}

function validateDeletion(root: string, deletion: any, manifest: any, sourceCommit: string, baseline: string, blockers: string[]) {
  const truth = deletionTruth(root, baseline, sourceCommit)
  if (!deletion || deletion.schema !== 'sks.release-overengineering-deletions.v1' || deletion.baseline !== baseline
    || deletion.source_commit !== sourceCommit || deletion.counting_semantics !== DELETION_COUNTING_SEMANTICS
    || !Array.isArray(deletion.removed_modules) || !Number.isSafeInteger(deletion.removed_file_count)
    || !Number.isSafeInteger(deletion.removed_lines) || !Number.isSafeInteger(deletion.total_diff_deletions)
    || !sha256(deletion.removed_path_manifest_sha256)) blockers.push('deletion_evidence_invalid')
  if (!truth.ok) blockers.push('deletion_truth_unavailable')
  else {
    if (!sameSet(strings(deletion?.removed_modules), truth.modules)) blockers.push('removed_modules_mismatch')
    if (deletion?.removed_file_count !== truth.modules.length) blockers.push('removed_file_count_mismatch')
    if (deletion?.removed_lines !== truth.pureDeletionLines) blockers.push('removed_lines_mismatch')
    if (deletion?.total_diff_deletions !== truth.totalDeletions) blockers.push('total_diff_deletions_mismatch')
    if (deletion?.removed_path_manifest_sha256 !== truth.pathManifestSha256) blockers.push('removed_path_manifest_hash_mismatch')
    if (JSON.stringify(manifest?.deletion_truth) !== JSON.stringify(truth.manifest)) blockers.push('deletion_manifest_mismatch')
  }
}

function validateEvidenceFile(root: string, entry: any, expected: any, label: string, blockers: string[]) {
  if (!entry || !text(entry.path) || path.isAbsolute(entry.path) || !sha256(entry.sha256) || !text(entry.schema)
    || !positiveLineCount(entry.line_count) || entry.source_commit !== expected.sourceCommit || entry.mission_id !== expected.missionId) {
    blockers.push(`${label}:reference_invalid`)
    return
  }
  const file = safeRootFile(root, entry.path)
  if (!file || fileSha256(file) !== entry.sha256 || fileLineCount(file) !== entry.line_count) {
    blockers.push(`${label}:hash_mismatch`)
    return
  }
  const proof = readJson(file)
  if (!proof || proof.schema !== entry.schema || proof.schema !== (expected.schema || entry.schema)
    || proof.source_commit !== expected.sourceCommit || proof.mission_id !== expected.missionId
    || proof.ok !== true || (Array.isArray(proof.blockers) && proof.blockers.length)) blockers.push(`${label}:content_invalid`)
  if (expected.findingId && (proof.finding_id !== expected.findingId || proof.status !== expected.findingStatus)) blockers.push(`${label}:finding_binding_invalid`)
  if (expected.workOrderId && (proof.work_order_id !== expected.workOrderId
    || !['both', expected.evidenceKind].includes(String(proof.evidence_kind || '')))) blockers.push(`${label}:work_order_binding_invalid`)
}

function validateRolloutProvenance(root: string, event: any, expectedAgentPath: any, blockers: string[]) {
  const proof = event?.provenance
  const id = String(event?.thread_id || 'missing')
  if (!proof || proof.schema !== LIFECYCLE_PROVENANCE_SCHEMA || !text(proof.rollout_path)
    || !Number.isSafeInteger(proof.line) || proof.line < 1 || !sha256(proof.line_sha256)
    || !sha256(proof.rollout_prefix_sha256) || !text(proof.agent_path) || proof.agent_path !== expectedAgentPath) {
    blockers.push(`subagent_rollout_provenance_invalid:${id}`)
    return
  }
  const rollout = trustedRolloutPath(root, proof.rollout_path)
  const line = rollout ? rolloutLineProof(rollout, proof.line) : null
  if (!line || line.lineSha256 !== proof.line_sha256 || line.prefixSha256 !== proof.rollout_prefix_sha256) {
    blockers.push(`subagent_rollout_hash_mismatch:${id}`)
    return
  }
  const row = parseJson(line.text)
  if (event.event_name === 'SubagentStart') {
    const payload = row?.payload
    if (row?.type !== 'event_msg' || payload?.type !== 'sub_agent_activity' || payload?.kind !== 'started'
      || payload?.agent_thread_id !== id || payload?.agent_path !== proof.agent_path
      || payload?.event_id !== proof.event_id || row?.timestamp !== event.occurred_at) blockers.push(`subagent_rollout_start_mismatch:${id}`)
  } else {
    const payload = row?.payload
    const content = JSON.stringify(payload?.content || [])
    if (row?.type !== 'response_item' || payload?.type !== 'agent_message' || payload?.author !== proof.agent_path
      || !content.includes('FINAL_ANSWER') || row?.timestamp !== event.occurred_at) blockers.push(`subagent_rollout_stop_mismatch:${id}`)
  }
}

function attachmentTruth(ledger: any): { ok: boolean; blockers: string[]; manifest: any } {
  const blockers: string[] = []
  const sourcePath = resolveSourcePath(ledger?.source_path)
  const sourceHash = sourcePath ? fileSha256(sourcePath) : null
  const lines = sourcePath ? readSourceLines(sourcePath) : null
  if (!sourcePath || !sourceHash || !lines) blockers.push('work_order_attachment_file_missing')
  if (sourceHash && sourceHash !== ledger?.source_sha256) blockers.push('work_order_attachment_sha_mismatch')
  if (lines && lines.length !== ledger?.source_line_count) blockers.push(`work_order_attachment_line_count_mismatch:${lines.length}/${String(ledger?.source_line_count)}`)
  const attachmentItems = (ledger?.items || []).filter((item: any) => item?.source?.type === 'attachment')
    .sort((a: any, b: any) => Number(a?.source?.line_start) - Number(b?.source?.line_start))
  const chatItems = (ledger?.items || []).filter((item: any) => item?.source?.type === 'chat_text')
  if (attachmentItems.length !== 26) blockers.push(`work_order_attachment_range_count_mismatch:${attachmentItems.length}/26`)
  if (chatItems.length !== 2 || chatItems.some((item: any) => !text(item?.source?.verbatim))) blockers.push('work_order_chat_sources_invalid')
  const slices: any[] = []
  let next = 1
  for (const item of attachmentItems) {
    const start = Number(item?.source?.line_start)
    const end = Number(item?.source?.line_end)
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start !== next || end < start) {
      blockers.push('work_order_coverage_invalid')
      break
    }
    const calculated = lines ? sliceSha256(lines, start, end) : null
    if (!calculated || item?.source?.slice_sha256 !== calculated) blockers.push(`work_order_slice_hash_mismatch:${item?.id || 'missing'}`)
    slices.push({ id: item?.id, line_start: start, line_end: end, sha256: calculated })
    next = end + 1
  }
  if (attachmentItems.length === 26 && lines && next !== lines.length + 1) blockers.push('work_order_coverage_incomplete')
  return {
    ok: blockers.length === 0,
    blockers,
    manifest: {
      path: ledger?.source_path || null,
      sha256: sourceHash,
      line_count: lines?.length ?? null,
      slice_hash_semantics: SLICE_HASH_SEMANTICS,
      slices
    }
  }
}

function deletionTruth(root: string, baseline: string, head: string) {
  if (!sha40(baseline) || !sha40(head)) return { ok: false, modules: [] as string[], pureDeletionLines: 0, totalDeletions: 0, pathManifestSha256: '', manifest: null }
  const names = git(root, ['diff', '--find-renames', '--name-only', '--diff-filter=D', baseline, head])
  const deletedStats = git(root, ['diff', '--find-renames', '--numstat', '--diff-filter=D', baseline, head])
  const allStats = git(root, ['diff', '--find-renames', '--numstat', baseline, head])
  const modules = names.stdout.split(/\r?\n/).filter(Boolean).sort()
  const pureDeletionLines = numstatDeletions(deletedStats.stdout)
  const totalDeletions = numstatDeletions(allStats.stdout)
  const pathManifestSha256 = hashText(modules.length ? `${modules.join('\n')}\n` : '')
  const ok = names.ok && deletedStats.ok && allStats.ok
  return {
    ok,
    modules,
    pureDeletionLines,
    totalDeletions,
    pathManifestSha256,
    manifest: ok ? {
      counting_semantics: DELETION_COUNTING_SEMANTICS,
      removed_file_count: modules.length,
      removed_lines: pureDeletionLines,
      total_diff_deletions: totalDeletions,
      removed_path_manifest_sha256: pathManifestSha256
    } : null
  }
}

function flattenFindingProofs(findings: any) {
  return (findings?.findings || []).flatMap((row: any) => (row?.closure?.proof || []).map((entry: any) => ({
    finding_id: row?.id,
    path: entry?.path,
    sha256: entry?.sha256,
    line_count: entry?.line_count
  }))).sort((a: any, b: any) => findingProofKey(a).localeCompare(findingProofKey(b)))
}

function flattenWorkOrderEvidence(ledger: any) {
  return (ledger?.items || []).flatMap((item: any) => [
    ...(item?.implementation_evidence || []).map((entry: any) => ({
      work_order_id: item?.id, kind: 'implementation', path: entry?.path, sha256: entry?.sha256, line_count: entry?.line_count
    })),
    ...(item?.verification_evidence || []).map((entry: any) => ({
      work_order_id: item?.id, kind: 'verification', path: entry?.path, sha256: entry?.sha256, line_count: entry?.line_count
    }))
  ]).sort((a: any, b: any) => workOrderEvidenceKey(a).localeCompare(workOrderEvidenceKey(b)))
}

function requiredArtifactPaths(version: string, missionId: string) {
  return Object.fromEntries(Object.entries(REQUIRED_ARTIFACTS).map(([key, value]) => [key, {
    path: value.path(version, missionId),
    schema: value.schema
  }])) as Record<keyof typeof REQUIRED_ARTIFACTS, { path: string; schema: string | null }>
}

function sourceCommitBound(root: string, value: string, baseline: string, head: string) {
  return sha40(value) && value !== baseline && value !== head && gitOk(root, ['merge-base', '--is-ancestor', baseline, value])
    && gitOk(root, ['merge-base', '--is-ancestor', value, head])
}

function validatePostSourceCommitDiff(root: string, sourceCommit: string, head: string, version: string, blockers: string[]) {
  if (!sha40(sourceCommit) || !sha40(head) || sourceCommit === head) return
  const diff = git(root, ['diff', '--name-only', `${sourceCommit}..${head}`, '--'])
  if (!diff.ok) {
    blockers.push('closure_post_source_diff_unavailable')
    return
  }
  const allowedPrefix = `.sneakoscope/release/${version}/`
  for (const changedPath of diff.stdout.split(/\r?\n/).filter(Boolean)) {
    if (!changedPath.startsWith(allowedPrefix)) blockers.push(`closure_post_source_change_forbidden:${changedPath}`)
  }
}

function trackedBlobMatches(root: string, head: string, relativePath: string, expectedSha: string | null) {
  if (!sha40(head) || !sha256(expectedSha) || !gitOk(root, ['ls-files', '--error-unmatch', '--', relativePath])) return false
  const result = spawnSync('git', ['show', `${head}:${relativePath}`], { cwd: root, encoding: null, maxBuffer: 32 * 1024 * 1024 })
  return result.status === 0 && hashBuffer(Buffer.from(result.stdout || [])) === expectedSha
}

function safeRootFile(root: string, relativePath: string) {
  const base = `${path.resolve(root)}${path.sep}`
  const resolved = path.resolve(root, relativePath)
  if (!resolved.startsWith(base)) return null
  try { return fs.lstatSync(resolved).isFile() ? resolved : null } catch { return null }
}

function trustedRolloutPath(root: string, value: string) {
  const resolved = path.resolve(value)
  const candidates = [
    path.resolve(root, '.codex', 'sessions'),
    path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'sessions')
  ]
  if (!candidates.some((base) => resolved === base || resolved.startsWith(`${base}${path.sep}`))) return null
  try { return fs.lstatSync(resolved).isFile() ? resolved : null } catch { return null }
}

function rolloutLineProof(file: string, lineNumber: number) {
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split('\n')
  if (lineNumber < 1 || lineNumber > lines.length) return null
  const line = lines[lineNumber - 1] || ''
  const terminal = lineNumber < lines.length ? '\n' : ''
  const prefix = `${lines.slice(0, lineNumber).join('\n')}${terminal}`
  return { text: line, lineSha256: hashText(line), prefixSha256: hashText(prefix) }
}

function resolveSourcePath(value: any) {
  if (!text(value)) return null
  const resolved = path.resolve(value)
  try { return fs.lstatSync(resolved).isFile() ? resolved : null } catch { return null }
}

function readSourceLines(file: string) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  if (!text) return []
  return (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n')
}

function sliceSha256(lines: string[], start: number, end: number) {
  return hashText(`${lines.slice(start - 1, end).join('\n')}\n`)
}

function numstatDeletions(value: string) {
  let count = 0
  for (const row of value.split(/\r?\n/)) {
    const deleted = row.split('\t')[1]
    if (deleted && /^\d+$/.test(deleted)) count += Number(deleted)
  }
  return count
}

function acceptedRiskComplete(value: any) {
  return ['owner', 'expires_version', 'reproduction', 'user_impact', 'why_safe_for_6_3_0', 'removal_plan'].every((key) => text(value?.[key]))
}

function sameJsonSet(left: any[], right: any[], key: (value: any) => string) {
  const a = left.map(key).sort()
  const b = right.map(key).sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function findingProofKey(value: any) {
  return `${String(value?.finding_id || '')}:${String(value?.path || '')}:${String(value?.sha256 || '')}:${String(value?.line_count || '')}`
}

function workOrderEvidenceKey(value: any) {
  return `${String(value?.work_order_id || '')}:${String(value?.kind || '')}:${String(value?.path || '')}:${String(value?.sha256 || '')}:${String(value?.line_count || '')}`
}

function sameSet(left: any, right: readonly string[]) {
  const values = strings(left)
  return values.length === right.length && new Set(values).size === values.length && right.every((value) => values.includes(value))
}

function strings(value: any): string[] {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim()) : []
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function relative(root: string, file: string) {
  return path.relative(root, file).split(path.sep).join('/')
}

function text(value: any): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function sha40(value: any) {
  return /^[a-f0-9]{40}$/i.test(String(value || ''))
}

function sha256(value: any): value is string {
  return /^[a-f0-9]{64}$/i.test(String(value || ''))
}

function positiveLineCount(value: any) {
  return Number.isSafeInteger(value) && value > 0
}

function hashText(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function hashBuffer(value: Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function fileSha256(file: string): string | null {
  try { return hashBuffer(fs.readFileSync(file)) } catch { return null }
}

function fileLineCount(file: string): number | null {
  try {
    const value = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
    if (!value) return 0
    return value.endsWith('\n') ? value.slice(0, -1).split('\n').length : value.split('\n').length
  } catch {
    return null
  }
}

function parseJson(value: string): any {
  try { return JSON.parse(value) } catch { return null }
}

function git(root: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  return { ok: result.status === 0, stdout: result.status === 0 ? String(result.stdout || '').trim() : '' }
}

function readJson(file: string): any {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

function readJsonl(file: string): any[] | null {
  try {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line.trim())
    return lines.length ? lines.map((line) => JSON.parse(line)) : null
  } catch { return null }
}

function gitText(root: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  return result.status === 0 ? String(result.stdout || '').trim() : ''
}

function gitOk(root: string, args: string[]): boolean {
  return spawnSync('git', args, { cwd: root, stdio: 'ignore' }).status === 0
}
