import path from 'node:path';
import fsp from 'node:fs/promises';
import { exists, nowIso, readJson, writeJsonAtomic } from '../fsx.mjs';
import { findLatestMission, missionDir } from '../mission.mjs';
import { readRouteProof } from '../proof/proof-reader.mjs';
import { validateCompletionContract } from './completion-contract.mjs';
import { writeEvidenceIndexForProof } from '../evidence/evidence-router.mjs';
import { missionEvidenceIndexPath, readEvidenceIndex } from '../evidence/evidence-store.mjs';
import { routeCompletionContractPath, writeRouteCompletionContract } from './route-contract.mjs';
import { lastJsonlEventTime } from '../evidence/evidence-freshness.mjs';
import { routeStateMachineSnapshot } from './route-state-machine.mjs';
import { combineTrustStatus } from './trust-status.mjs';
import { TRUST_REPORT_SCHEMA, trustKernelMetadata } from './trust-kernel-schema.mjs';

export function trustReportPath(root, missionId) {
  return path.join(missionDir(root, missionId), 'trust-report.json');
}

export async function writeTrustArtifactsForProof(root, proof = {}) {
  if (!proof?.mission_id) return null;
  const evidenceIndex = await writeEvidenceIndexForProof(root, proof);
  const contract = await writeRouteCompletionContract(root, proof, evidenceIndex);
  const report = buildTrustReport({ proof, evidenceIndex, contract });
  await writeJsonAtomic(trustReportPath(root, proof.mission_id), report);
  return { evidenceIndex, contract, report };
}

export async function latestTrustReport(root, missionArg = 'latest') {
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
  return (await writeTrustArtifactsForProof(root, proof)).report;
}

export function buildTrustReport({ proof = {}, evidenceIndex = {}, contract = {} } = {}) {
  const validation = contract.validation || validateCompletionContract(contract, proof, evidenceIndex);
  const statuses = [
    proof.status || 'not_verified',
    evidenceIndex.status || 'not_verified',
    validation.status || 'not_verified'
  ];
  const status = validation.ok ? combineTrustStatus(statuses) : 'blocked';
  const issues = [...new Set([...(validation.issues || []), ...(evidenceIndex.issues || [])])];
  return {
    schema: TRUST_REPORT_SCHEMA,
    ...trustKernelMetadata(),
    ok: issues.length === 0 && !['blocked', 'failed', 'not_verified'].includes(status),
    mission_id: proof.mission_id || contract.mission_id || null,
    route: proof.route || contract.route || null,
    status,
    proof_status: proof.status || 'not_verified',
    evidence_status: evidenceIndex.status || 'not_verified',
    route_contract_status: validation.status || 'not_verified',
    issues,
    route_state_machine: routeStateMachineSnapshot({ proof, evidenceIndex, contract: { ...contract, trust_report: true } }),
    evidence: {
      completion_proof: proof.mission_id ? `.sneakoscope/missions/${proof.mission_id}/completion-proof.json` : null,
      route_contract: proof.mission_id ? `.sneakoscope/missions/${proof.mission_id}/route-completion-contract.json` : null,
      evidence_index: proof.mission_id ? `.sneakoscope/missions/${proof.mission_id}/evidence-index.json` : null,
      evidence_records: evidenceIndex.records?.length || 0
    },
    scout_quality: scoutQualityFromProof(proof),
    blockers: issues.filter((issue) => /missing|blocked|stale|secret|not_passed|cannot_verify/i.test(issue))
  };
}

function scoutQualityFromProof(proof = {}) {
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

async function temporalTrustIssues(root, missionId, { report = {}, proof = null } = {}) {
  const issues = [];
  if (!missionId) return issues;
  const dir = missionDir(root, missionId);
  const evidenceIndex = await readEvidenceIndex(root, missionId);
  const contract = await readJson(routeCompletionContractPath(root, missionId), null);
  const latestEvent = await lastJsonlEventTime(path.join(dir, 'events.jsonl'));
  const proofTime = await artifactTime(path.join(dir, 'completion-proof.json'), proof);
  const evidenceTime = await artifactTime(missionEvidenceIndexPath(root, missionId), evidenceIndex);
  const contractTime = await artifactTime(routeCompletionContractPath(root, missionId), contract);
  const reportTime = await artifactTime(trustReportPath(root, missionId), report);
  if (Number.isFinite(latestEvent) && Number.isFinite(proofTime) && proofTime < latestEvent) issues.push('stale_proof');
  if (Number.isFinite(evidenceTime) && Number.isFinite(proofTime) && evidenceTime < proofTime) issues.push('stale_evidence_index');
  if (Number.isFinite(contractTime) && Number.isFinite(proofTime) && contractTime < proofTime) issues.push('stale_route_contract');
  if (Number.isFinite(reportTime)) {
    if (Number.isFinite(evidenceTime) && reportTime < evidenceTime) issues.push('stale_trust_report');
    if (Number.isFinite(contractTime) && reportTime < contractTime) issues.push('stale_trust_report');
    if (Number.isFinite(proofTime) && reportTime < proofTime) issues.push('stale_trust_report');
  }
  return [...new Set(issues)];
}

async function artifactTime(file, artifact = null) {
  const generated = Date.parse(artifact?.generated_at || '');
  if (Number.isFinite(generated)) return generated;
  try {
    const stat = await fsp.stat(file);
    return stat.mtimeMs;
  } catch {
    return Number.NaN;
  }
}

function staleTrustReport(report = {}, issues = []) {
  const nextIssues = [...new Set([...(report.issues || []), ...issues])];
  return {
    ...report,
    ok: false,
    status: 'blocked',
    issues: nextIssues,
    blockers: [...new Set([...(report.blockers || []), ...issues])]
  };
}
