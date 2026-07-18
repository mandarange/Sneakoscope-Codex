import path from 'node:path'
import { validateWorkOrderLedger } from '../artifact-schemas.js'
import { evaluateOfficialSubagentExecutionProof } from '../proof/fake-real-proof-policy.js'
import { validateSsotGuardArtifact } from '../safety/ssot-guard.js'
import { buildSubagentEvidence } from '../subagents/subagent-evidence.js'
import { normalizeLegacySubagentCountFields } from '../subagents/wave-lifecycle.js'
import {
  DELETION_COUNTING_SEMANTICS,
  FINDING_IDS,
  FINDING_PROOF_SCHEMA,
  FINDING_STATUSES,
  LIFECYCLE_PROVENANCE_SCHEMA,
  P0,
  P0_FINDING_STATUSES,
  P2,
  POST_MAIN_WORK_ORDERS,
  WORK_ORDER_IDS
} from './release-closure-contract.js'
import {
  acceptedRiskComplete,
  attachmentTruth,
  deletionTruth,
  fileLineCount,
  fileSha256,
  findingProofKey,
  parseJson,
  readJson,
  rolloutLineProof,
  safeRootFile,
  sameJsonSet,
  sameSet,
  sha256,
  strings,
  text,
  trustedRolloutPath,
  workOrderEvidenceKey
} from './release-closure-helpers.js'

export function validateFindings(root: string, findings: any, manifest: any, sourceCommit: string, missionId: string, baseline: string, blockers: string[]) {
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

export function validateMission(mission: any, sourceCommit: string, missionId: string, blockers: string[]) {
  if (!mission || mission.id !== missionId || String(mission.mode || '').toLowerCase() !== 'naruto') blockers.push('mission_identity_invalid')
  if (mission?.implementation_allowed !== true) blockers.push('mission_implementation_not_allowed')
  if (mission?.phase !== 'NARUTO_COMPLETE') blockers.push('mission_not_complete')
  if (mission?.completion?.status !== 'completed' || mission?.completion?.mission_id !== missionId || mission?.completion?.source_commit !== sourceCommit) {
    blockers.push('mission_completion_binding_invalid')
  }
}

export function validateOfficialThreads(root: string, value: any, blockers: string[]) {
  const { plan, rawEvents, parent, evidence, summary, gate, ssot, missionId } = value
  const normalizedEvidence = normalizeLegacySubagentCountFields(evidence, plan)
  const normalizedSummary = normalizeLegacySubagentCountFields(summary, plan)
  const normalizedGate = normalizeLegacySubagentCountFields(gate, plan)
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

  const official = evaluateOfficialSubagentExecutionProof({
    subagent_plan: plan,
    subagent_evidence: normalizedEvidence,
    naruto_summary: normalizedSummary,
    naruto_gate: normalizedGate
  }, { required: true })
  if (official.proof_level !== 'proven') blockers.push(...official.blockers.map((item) => `naruto:${item}`))
  const rebuilt = buildSubagentEvidence({
    requestedSubagents: 3,
    countPolicy: 'exact',
    targetSubagents: 3,
    events,
    parentSummary: parent,
    parentSummaryPresent: Boolean(parent),
    workflowStatus: 'completed',
    preparationOnly: false,
    runId
  })
  const evidenceKeys = [
    'ok', 'status', 'preparation_only', 'requested_subagents', 'count_policy', 'target_subagents', 'started_threads', 'completed_threads', 'failed_threads',
    'started_thread_ids', 'completed_thread_ids', 'failed_thread_ids', 'open_thread_ids', 'unmatched_stop_thread_ids',
    'ambiguous_stop_thread_ids', 'event_sources', 'parent_summary_present', 'parent_summary_trustworthy',
    'parent_summary_status', 'run_id', 'blockers'
  ]
  if (!rebuilt.ok || evidenceKeys.some((key) => JSON.stringify((rebuilt as any)[key]) !== JSON.stringify(normalizedEvidence?.[key]))) blockers.push('subagent_evidence_recompute_mismatch')

  const parentIds = strings((parent?.thread_outcomes || []).map((row: any) => row?.thread_id)).sort()
  if (parent?.schema !== 'sks.subagent-parent-summary.v1' || parent?.status !== 'completed' || parent?.run_id !== runId
    || !parent?.changed_files?.length || !parent?.verification?.length || (parent?.blockers || []).length
    || parent?.thread_outcomes?.length !== 3 || !sameSet(parentIds, startIds)
    || parent.thread_outcomes.some((row: any) => row?.status !== 'completed' || !text(row?.summary))) blockers.push('parent_summary_invalid')
  if (normalizedSummary?.mission_id !== missionId || normalizedSummary?.workflow_run_id !== runId || normalizedSummary?.requested_subagents !== 3
    || normalizedSummary?.count_policy !== 'exact' || normalizedSummary?.target_subagents !== 3
    || normalizedSummary?.ok !== true || normalizedSummary?.completion_evidence !== true || normalizedSummary?.status !== 'completed'
    || normalizedSummary?.parent_summary_present !== true || !sameSet(strings((normalizedSummary?.parent_thread_outcomes || []).map((row: any) => row?.thread_id)), startIds)) blockers.push('naruto_summary_inconsistent')
  if (normalizedGate?.mission_id !== missionId || normalizedGate?.workflow_run_id !== runId || normalizedGate?.requested_subagents !== 3
    || normalizedGate?.count_policy !== 'exact' || normalizedGate?.target_subagents !== 3
    || normalizedGate?.started_subagents !== 3 || normalizedGate?.completed_subagents !== 3 || normalizedGate?.failed_subagents !== 0
    || normalizedGate?.passed !== true || normalizedGate?.terminal !== true || normalizedGate?.terminal_state !== 'completed'
    || normalizedGate?.official_subagent_evidence !== true || normalizedGate?.subagent_evidence_ready !== true
    || normalizedGate?.parent_summary_present !== true || normalizedGate?.session_cleanup !== true || normalizedGate?.ssot_guard !== true
    || (normalizedGate?.blockers || []).length) blockers.push('naruto_gate_inconsistent')
  if (!validateSsotGuardArtifact(ssot).ok) blockers.push('ssot_guard_invalid')
}

export function validateReleaseLedger(root: string, ledger: any, manifest: any, sourceCommit: string, missionId: string, expectedSha: string, blockers: string[]) {
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

export function validateDeletion(root: string, deletion: any, manifest: any, sourceCommit: string, baseline: string, blockers: string[]) {
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
    || !Number.isSafeInteger(entry.line_count) || entry.line_count < 1
    || entry.source_commit !== expected.sourceCommit || entry.mission_id !== expected.missionId) {
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
