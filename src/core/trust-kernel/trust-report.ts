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
    return {
      schema: TRUST_REPORT_SCHEMA,
      ...trustKernelMetadata(),
      ok: false,
      mission_id: missionId,
      status: 'blocked',
      issues: ['completion_proof_missing']
    };
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
  issues.push(...imageUxReview.issues);
  const finalStatus = imageUxReview.issues.length && status === 'verified' ? 'verified_partial' : status;
  return {
    schema: TRUST_REPORT_SCHEMA,
    ...trustKernelMetadata(),
    ok: issues.length === 0 && !['blocked', 'failed', 'not_verified'].includes(finalStatus),
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
      image_ux_review: imageUxReview.summary
    },
    image_ux_review: imageUxReview.summary,
    wrongness: wrongness.summary,
    scout_quality: scoutQualityFromProof(proof),
    blockers: issues.filter((issue: any) => /missing|blocked|stale|secret|not_passed|cannot_verify|text_only|mock_gpt_image_2_fixture/i.test(issue))
  };
}

function imageUxReviewTrust(proof: any = {}) {
  const evidence = proof.evidence?.image_ux_review;
  if (!evidence) return { issues: [], summary: { required: false, status: 'not_required' } };
  const issues: string[] = [];
  if (Number(evidence.generated_images_total || 0) > 0 && Number(evidence.generated_gpt_image_2_callout_images_count || 0) === 0) {
    issues.push('mock_gpt_image_2_fixture_cannot_be_real_verified');
  }
  if ((evidence.blockers || []).includes('ux_review_text_only_fallback')) issues.push('text_only_ux_review_cannot_be_verified');
  if ((evidence.blockers || []).includes('missing_generated_annotated_review_images')) issues.push('gpt_image_2_callout_image_missing');
  return {
    issues,
    summary: {
      schema: evidence.schema || 'sks.image-ux-review-proof-evidence.v1',
      required: true,
      status: evidence.status || 'not_verified',
      source_screenshots_count: evidence.source_screenshots_count || 0,
      generated_gpt_image_2_callout_images_count: evidence.generated_gpt_image_2_callout_images_count || 0,
      generated_images_total: evidence.generated_images_total || 0,
      callout_extraction_schema_status: evidence.callout_extraction_schema_status || 'unknown',
      open_p0_p1_count: evidence.open_p0_p1_count || 0,
      recapture_re_review_status: evidence.recapture_re_review_status || 'unknown',
      image_voxel_relation_count: evidence.image_voxel_relation_count || 0,
      blockers: evidence.blockers || []
    }
  };
}

function scoutQualityFromProof(proof: any = {}) {
  const scouts = proof.evidence?.scouts;
  if (!scouts) {
    return {
      schema: 'sks.scout-quality.v1',
      required: false,
      confidence: 'not_required'
    };
  }
  const high = scouts.real_parallel === true
    && scouts.completed_scouts === 5
    && scouts.read_only_confirmed === true
    && scouts.gate === 'passed';
  return {
    schema: 'sks.scout-quality.v1',
    parsed_outputs: high ? 5 : Number(scouts.completed_scouts || 0),
    blocked_scouts: scouts.gate === 'passed' ? 0 : Math.max(0, Number(scouts.scout_count || 5) - Number(scouts.completed_scouts || 0)),
    findings_count: Number(scouts.findings_count || 0),
    suggested_tasks_count: Number(scouts.suggested_tasks_count || 0),
    read_only_guard: scouts.read_only_confirmed ? 'passed' : 'not_verified',
    source_policy: high ? 'parsed_real_scout_outputs' : 'local_static_or_verified_partial',
    confidence: high ? 'high' : 'verified_partial',
    real_parallel: Boolean(scouts.real_parallel),
    speedup_claim_allowed: Boolean(scouts.speedup_claim_allowed)
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
