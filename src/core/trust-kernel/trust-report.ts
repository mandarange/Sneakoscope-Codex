import path from 'node:path';
import fsp from 'node:fs/promises';
import { exists, nowIso, readJson, writeJsonAtomic } from '../fsx.js';
import { findLatestMission, missionDir } from '../mission.js';
import { readRouteProof } from '../proof/proof-reader.js';
import { validateCompletionContract } from './completion-contract.js';
import { writeEvidenceIndexForProof } from '../evidence/evidence-router.js';
import { missionEvidenceIndexPath, readEvidenceIndex } from '../evidence/evidence-store.js';
import { routeCompletionContractPath, writeRouteCompletionContract } from './route-contract.js';
import { lastJsonlEventTime } from '../evidence/evidence-freshness.js';
import { routeStateMachineSnapshot } from './route-state-machine.js';
import { combineTrustStatus } from './trust-status.js';
import { TRUST_REPORT_SCHEMA, trustKernelMetadata } from './trust-kernel-schema.js';
import { evaluateWrongnessTrust, applyWrongnessTrustStatus } from '../triwiki-wrongness/wrongness-trust-policy.js';
import { gitCollaborationTrust } from '../git-hygiene/collaboration-trust.js';

export function trustReportPath(root: any, missionId: any) {
  return path.join(missionDir(root, missionId), 'trust-report.json');
}

export async function writeTrustArtifactsForProof(root: any, proof: any = {}) {
  if (!proof?.mission_id) return null;
  const evidenceIndex = await writeEvidenceIndexForProof(root, proof);
  const contract = await writeRouteCompletionContract(root, proof, evidenceIndex);
  const report = buildTrustReport({ proof, evidenceIndex, contract });
  (report as any).git_collaboration = await gitCollaborationTrust(root).catch((err) => ({
    schema: 'sks.git-collaboration-trust.v1',
    ok: false,
    status: 'blocked',
    issues: [`git_collaboration_trust_error:${err instanceof Error ? err.message : String(err)}`],
    summary: {}
  }));
  await writeJsonAtomic(trustReportPath(root, proof.mission_id), report);
  return { evidenceIndex, contract, report };
}

export async function latestTrustReport(root: any, missionArg: any = 'latest') {
  const missionId = !missionArg || missionArg === 'latest' ? await findLatestMission(root) : missionArg;
  if (!missionId) {
    return {
      schema: TRUST_REPORT_SCHEMA,
      ...trustKernelMetadata(),
      ok: false,
      mission_id: null,
      status: 'not_verified',
      issues: ['mission_missing']
    };
  }
  const file = trustReportPath(root, missionId);
  const proof = await readRouteProof(root, missionId);
  if (await exists(file)) {
    const report = await readJson(file);
    const temporalIssues = await temporalTrustIssues(root, missionId, { report, proof });
    if (!temporalIssues.length) return report;
    return staleTrustReport(report, temporalIssues);
  }
  if (!proof) {
    // Persist this computed report even though it's a blocked result: `trust report`
    // is expected to leave a durable trust-report.json behind for anyone (a human or
    // a later `sks trust report <mission>` call) to inspect, the same way the
    // completion-proof-present path below does via writeTrustArtifactsForProof(). An
    // in-memory-only "blocked" result that vanishes after this call returns is
    // surprising and was the reason `sks trust report latest --json` could exit 0
    // with a blocked status yet leave no artifact on disk.
    const report = {
      schema: TRUST_REPORT_SCHEMA,
      ...trustKernelMetadata(),
      ok: false,
      mission_id: missionId,
      status: 'blocked',
      issues: ['completion_proof_missing']
    };
    await writeJsonAtomic(trustReportPath(root, missionId), report).catch(() => undefined);
    return report;
  }
  const rebuilt = await writeTrustArtifactsForProof(root, proof);
  if (!rebuilt) {
    return {
      schema: TRUST_REPORT_SCHEMA,
      ...trustKernelMetadata(),
      ok: false,
      mission_id: missionId,
      status: 'blocked',
      issues: ['trust_report_rebuild_skipped']
    };
  }
  return rebuilt.report;
}

export function buildTrustReport({ proof = {}, evidenceIndex = {}, contract = {} }: any = {}) {
  const validation = contract.validation || validateCompletionContract(contract, proof, evidenceIndex);
  const wrongness = evaluateWrongnessTrust({ proof, evidenceIndex, contract });
  const statuses = [
    proof.status || 'not_verified',
    evidenceIndex.status || 'not_verified',
    validation.status || 'not_verified'
  ];
  const baseStatus = validation.ok ? combineTrustStatus(statuses) : 'blocked';
  const status = applyWrongnessTrustStatus(baseStatus, wrongness);
  const issues = [...new Set([...(validation.issues || []), ...(evidenceIndex.issues || []), ...(wrongness.issues || [])])];
  const imageUxReview = imageUxReviewTrust(proof);
  const pptReview = pptReviewTrust(proof);
  const dfix = dfixTrust(proof);
  const madSks = madSksTrust(proof);
  const sourceIntelligence = sourceIntelligenceTrust(proof);
  issues.push(...imageUxReview.issues);
  issues.push(...pptReview.issues);
  issues.push(...dfix.issues);
  issues.push(...madSks.issues);
  issues.push(...sourceIntelligence.issues);
  const routeSpecificIssues = imageUxReview.issues.length + pptReview.issues.length + dfix.issues.length + madSks.issues.length + sourceIntelligence.issues.length;
  const finalStatus = routeSpecificIssues && status === 'verified' ? 'verified_partial' : status;
  return {
    schema: TRUST_REPORT_SCHEMA,
    ...trustKernelMetadata(),
    ok: issues.length === 0 && !['blocked', 'failed', 'not_verified', 'mock_only'].includes(finalStatus),
    mission_id: proof.mission_id || contract.mission_id || null,
    route: proof.route || contract.route || null,
    status: finalStatus,
    proof_status: proof.status || 'not_verified',
    evidence_status: evidenceIndex.status || 'not_verified',
    route_contract_status: validation.status || 'not_verified',
    issues,
    route_state_machine: routeStateMachineSnapshot({ proof, evidenceIndex, contract: { ...contract, trust_report: true } }),
    evidence: {
      completion_proof: proof.mission_id ? `.sneakoscope/missions/${proof.mission_id}/completion-proof.json` : null,
      route_contract: proof.mission_id ? `.sneakoscope/missions/${proof.mission_id}/route-completion-contract.json` : null,
      evidence_index: proof.mission_id ? `.sneakoscope/missions/${proof.mission_id}/evidence-index.json` : null,
      evidence_records: evidenceIndex.records?.length || 0,
      wrongness: wrongness.summary,
      image_ux_review: imageUxReview.summary,
      ppt_review: pptReview.summary,
      dfix: dfix.summary,
      mad_sks: madSks.summary,
      source_intelligence: sourceIntelligence.summary
    },
    image_ux_review: imageUxReview.summary,
    ppt_review: pptReview.summary,
    dfix: dfix.summary,
    mad_sks: madSks.summary,
    source_intelligence: sourceIntelligence.summary,
    wrongness: wrongness.summary,
    blockers: issues.filter((issue: any) => /missing|blocked|stale|secret|not_passed|cannot_verify|text_only|mock_gpt_image_2_fixture/i.test(issue))
  };
}

function sourceIntelligenceTrust(proof: any = {}) {
  const evidence = proof.evidence?.source_intelligence;
  if (!evidence) return { issues: [], summary: { required: false, status: 'not_required' } };
  const proofBlockers = evidence.proof?.blockers || evidence.blockers || [];
  const issues = [...proofBlockers];
  if (evidence.policy?.context7?.required === true && evidence.context7?.ok !== true) issues.push('context7_missing');
  if (evidence.policy?.codex_web_search?.required === true && evidence.super_search?.proof?.provider_independent !== true) issues.push('super_search_provider_independent_proof_missing');
  return {
    issues: [...new Set(issues.map(String))],
    summary: {
      schema: evidence.schema || 'sks.source-intelligence-evidence.v1',
      required: true,
      status: evidence.ok === true ? 'verified' : 'blocked',
      mode: evidence.mode || evidence.policy?.mode || 'unknown',
      context7_status: evidence.context7?.status || 'unknown',
      codex_web_status: evidence.codex_web_search?.status || 'not_required',
      super_search_status: evidence.super_search?.proof?.ok === true ? 'verified' : evidence.super_search ? 'partial' : 'not_required',
      providers_completed: evidence.parallel?.providers_completed || [],
      blockers: proofBlockers
    }
  };
}

function madSksTrust(proof: any = {}) {
  const evidence = proof.evidence?.mad_sks;
  if (!evidence) return { issues: [], summary: { required: false, status: 'not_required' } };
  const issues: string[] = [];
  if (evidence.protected_core_unchanged !== true) issues.push('mad_sks_protected_core_changed_or_unverified');
  if (!evidence.authorization_manifest_path) issues.push('mad_sks_authorization_manifest_missing');
  if (!evidence.audit_ledger_path) issues.push('mad_sks_audit_ledger_missing');
  if (!evidence.rollback_plan_path) issues.push('mad_sks_rollback_plan_missing');
  if (!Array.isArray(evidence.verification) || evidence.verification.length === 0) issues.push('mad_sks_verification_missing');
  return {
    issues,
    summary: {
      schema: evidence.schema || 'sks.mad-sks-proof-evidence.v1',
      required: true,
      status: evidence.status || 'not_verified',
      protected_core_unchanged: evidence.protected_core_unchanged === true,
      authorization_manifest_path: evidence.authorization_manifest_path || null,
      audit_ledger_path: evidence.audit_ledger_path || null,
      rollback_plan_path: evidence.rollback_plan_path || null,
      blocked_actions: evidence.blocked_actions?.length || 0,
      local_only_artifact_policy: evidence.local_only_artifact_policy === true
    }
  };
}

function imageUxReviewTrust(proof: any = {}) {
  const evidence = proof.evidence?.image_ux_review;
  if (!evidence) return { issues: [], summary: { required: false, status: 'not_required' } };
  const issues: string[] = [];
  const referenceOnly = evidence.reference_only === true && evidence.status === 'verified_partial';
  if (Number(evidence.generated_images_total || 0) > 0 && Number(evidence.generated_gpt_image_2_callout_images_count || 0) === 0) {
    issues.push('mock_gpt_image_2_fixture_cannot_be_real_verified');
  }
  if ((evidence.blockers || []).includes('ux_review_text_only_fallback')) issues.push('text_only_ux_review_cannot_be_verified');
  if (!referenceOnly && (evidence.blockers || []).includes('missing_generated_annotated_review_images')) issues.push('gpt_image_2_callout_image_missing');
  if (evidence.callout_extraction_schema_status !== 'valid') issues.push('ux_review_extraction_schema_invalid');
  if (evidence.recapture_re_review_status === 'blocked') issues.push('ux_review_recapture_re_review_missing');
  if ((evidence.blockers || []).includes('callout_extraction_pending')) issues.push('ux_review_callout_extraction_pending');
  return {
    issues,
    summary: {
      schema: evidence.schema || 'sks.image-ux-review-proof-evidence.v1',
      required: true,
      status: evidence.status || 'not_verified',
      reference_only: referenceOnly,
      source_screenshots_count: evidence.source_screenshots_count || 0,
      generated_gpt_image_2_callout_images_count: evidence.generated_gpt_image_2_callout_images_count || 0,
      generated_images_total: evidence.generated_images_total || 0,
      callout_extraction_schema_status: evidence.callout_extraction_schema_status || 'unknown',
      open_p0_p1_count: evidence.open_p0_p1_count || 0,
      recapture_re_review_status: evidence.recapture_re_review_status || 'unknown',
      image_voxel_relation_count: evidence.image_voxel_relation_count || 0,
      full_verification_blockers: evidence.full_verification_blockers || [],
      blockers: evidence.blockers || []
    }
  };
}

function pptReviewTrust(proof: any = {}) {
  const evidence = proof.evidence?.ppt_review;
  if (!evidence) return { issues: [], summary: { required: false, status: 'not_required' } };
  const issues: string[] = [];
  const blockers = evidence.blockers || [];
  if (evidence.slide_export_status !== 'exported') issues.push('ppt_slide_export_missing');
  if (Number(evidence.generated_slide_callout_images_count || 0) === 0) issues.push('ppt_gpt_image_2_callout_image_missing');
  if (evidence.slide_issue_extraction_status !== 'valid') issues.push('ppt_slide_issue_extraction_pending');
  if (evidence.patch_requested === true && evidence.recheck_status !== 'complete') issues.push('ppt_patch_without_reexport_rereview');
  if (blockers.includes('ppt_text_only_review_fallback')) issues.push('ppt_text_only_review_cannot_be_verified');
  if (blockers.includes('ppt_mock_as_real')) issues.push('ppt_mock_fixture_cannot_be_real_verified');
  return {
    issues,
    summary: {
      schema: evidence.schema || 'sks.ppt-review-proof-evidence.v1',
      required: true,
      status: evidence.status || 'not_verified',
      deck_sha256: evidence.deck_sha256 || null,
      slide_count: evidence.slide_count || 0,
      exported_slide_images_count: evidence.exported_slide_images_count || 0,
      generated_slide_callout_images_count: evidence.generated_slide_callout_images_count || 0,
      slide_issue_extraction_status: evidence.slide_issue_extraction_status || 'unknown',
      open_p0_p1_count: evidence.open_p0_p1_count || 0,
      recheck_status: evidence.recheck_status || 'unknown',
      image_voxel_relation_count: evidence.image_voxel_relation_count || 0,
      blockers
    }
  };
}

function dfixTrust(proof: any = {}) {
  const evidence = proof.evidence?.dfix;
  if (!evidence) return { issues: [], summary: { required: false, status: 'not_required' } };
  const issues: string[] = [];
  if (evidence.diagnosis_present !== true) issues.push('dfix_diagnosis_missing');
  if (evidence.root_cause_present !== true) issues.push('dfix_root_cause_missing');
  if (evidence.patch_plan_present !== true) issues.push('dfix_patch_plan_missing');
  if (evidence.verification_present !== true) issues.push('dfix_verification_missing');
  if (evidence.noop_patch_wrongness === true) issues.push('dfix_noop_patch_wrongness');
  return {
    issues,
    summary: {
      schema: evidence.schema || 'sks.dfix-proof-evidence.v1',
      required: true,
      status: evidence.status || 'not_verified',
      diagnosis_present: evidence.diagnosis_present === true,
      root_cause_present: evidence.root_cause_present === true,
      patch_plan_present: evidence.patch_plan_present === true,
      patch_result_present: evidence.patch_result_present === true,
      verification_present: evidence.verification_present === true,
      blockers: evidence.blockers || []
    }
  };
}

async function temporalTrustIssues(root: any, missionId: any, { report = {}, proof = null }: any = {}) {
  const issues: any[] = [];
  if (!missionId) return issues;
  const dir = missionDir(root, missionId);
  const evidenceIndex = await readEvidenceIndex(root, missionId);
  const contract = await readJson(routeCompletionContractPath(root, missionId), null);
  const latestEvent = await lastJsonlEventTime(path.join(dir, 'events.jsonl'));
  const proofTime = await artifactTime(path.join(dir, 'completion-proof.json'), proof);
  const evidenceTime = await artifactTime(missionEvidenceIndexPath(root, missionId), evidenceIndex);
  const contractTime = await artifactTime(routeCompletionContractPath(root, missionId), contract);
  const reportTime = await artifactTime(trustReportPath(root, missionId), report);
  if (latestEvent !== null && Number.isFinite(proofTime) && proofTime < latestEvent) issues.push('stale_proof');
  if (Number.isFinite(evidenceTime) && Number.isFinite(proofTime) && evidenceTime < proofTime) issues.push('stale_evidence_index');
  if (Number.isFinite(contractTime) && Number.isFinite(proofTime) && contractTime < proofTime) issues.push('stale_route_contract');
  if (Number.isFinite(reportTime)) {
    if (Number.isFinite(evidenceTime) && reportTime < evidenceTime) issues.push('stale_trust_report');
    if (Number.isFinite(contractTime) && reportTime < contractTime) issues.push('stale_trust_report');
    if (Number.isFinite(proofTime) && reportTime < proofTime) issues.push('stale_trust_report');
  }
  return [...new Set(issues)];
}

async function artifactTime(file: any, artifact: any = null) {
  const generated = Date.parse(artifact?.generated_at || '');
  if (Number.isFinite(generated)) return generated;
  try {
    const stat = await fsp.stat(file);
    return stat.mtimeMs;
  } catch {
    return Number.NaN;
  }
}

function staleTrustReport(report: any = {}, issues: any = []) {
  const nextIssues = [...new Set([...(report.issues || []), ...issues])];
  return {
    ...report,
    ok: false,
    status: 'blocked',
    issues: nextIssues,
    blockers: [...new Set([...(report.blockers || []), ...issues])]
  };
}


export interface TrustReport {
  schema: typeof TRUST_REPORT_SCHEMA;
  ok: boolean;
  mission_id: string | null;
  route: string | null;
  status: import('./trust-kernel-schema.js').TrustStatus;
  proof_status: import('./trust-kernel-schema.js').TrustStatus;
  evidence_status: import('./trust-kernel-schema.js').TrustStatus;
  route_contract_status: import('./trust-kernel-schema.js').TrustStatus;
  issues: string[];
}
