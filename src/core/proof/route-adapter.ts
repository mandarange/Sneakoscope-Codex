import path from 'node:path';
import { collectProofEvidence } from './evidence-collector.js';
import { writeCompletionProof } from './proof-writer.js';
import { normalizeProofRoute, routeRequiresImageVoxelAnchors } from './route-proof-policy.js';
import { linkProofClaimsToEvidence, proofEvidenceSummary } from '../evidence/evidence-proof-linker.js';
import { writeTrustArtifactsForProof } from '../trust-kernel/trust-report.js';
import { enforceRetention } from '../retention.js';

export async function writeRouteCompletionProof(root: any, {
  missionId = null,
  route = null,
  status = 'verified_partial',
  gate = null,
  summary = {},
  artifacts = [],
  evidence = {},
  claims = [],
  unverified = [],
  blockers = [],
  nextHumanActions = []
}: any = {}) {
  const collected = await collectProofEvidence(root);
  const normalizedRoute = normalizeProofRoute(route);
  const mergedEvidence = {
    ...collected,
    ...evidence,
    route_gate: gate || evidence.route_gate || null,
    artifacts: normalizeArtifacts(root, artifacts)
  };
  const normalizedStatus = normalizeRouteProofStatus(status, {
    route: normalizedRoute,
    evidence: mergedEvidence,
    blockers,
    unverified
  });
  const written = await writeCompletionProof(root, {
    mission_id: missionId,
    route: normalizedRoute,
    status: normalizedStatus,
    summary: {
      files_changed: collected.files?.length || 0,
      commands_run: mergedEvidence.commands?.length || 0,
      tests_passed: 0,
      tests_failed: 0,
      manual_review_required: normalizedStatus !== 'verified',
      ...summary
    },
    evidence: mergedEvidence,
    claims,
    unverified,
    blockers,
    next_human_actions: nextHumanActions
  }, {
    command: {
      cmd: `sks proof route ${missionId || 'latest'}`,
      route: normalizedRoute,
      status: normalizedStatus
    }
  });
  if (!missionId) return written;
  const firstTrust: any = await writeTrustArtifactsForProof(root, written.proof);
  const evidenceSummary = proofEvidenceSummary(firstTrust.evidenceIndex);
  const enriched = await writeCompletionProof(root, {
    ...written.proof,
    evidence: {
      ...written.proof.evidence,
      evidence_router: evidenceSummary,
      route_contract: firstTrust.contract?.mission_id ? `.sneakoscope/missions/${firstTrust.contract.mission_id}/route-completion-contract.json` : null,
      trust_report: firstTrust.report?.mission_id ? `.sneakoscope/missions/${firstTrust.report.mission_id}/trust-report.json` : null
    },
    claims: linkProofClaimsToEvidence(written.proof, firstTrust.evidenceIndex)
  }, {
    command: {
      cmd: `sks trust finalize ${missionId}`,
      route: normalizedRoute,
      status: firstTrust.report?.status || normalizedStatus
    }
  });
  const trust = await writeTrustArtifactsForProof(root, enriched.proof);
  const retention = await runPostRouteRetention(root, missionId);
  return { ...enriched, trust, retention };
}

function normalizeRouteProofStatus(status: any, { route, evidence, blockers, unverified }: any) {
  if (blockers?.length) return status === 'failed' ? 'failed' : 'blocked';
  if (status === 'verified' && unverified?.length) return 'verified_partial';
  if (routeRequiresImageVoxelAnchors(route)) {
    const anchors = evidence?.image_voxels?.anchors ?? evidence?.image_voxels?.anchor_count ?? 0;
    if (Number(anchors) <= 0) return status === 'verified' ? 'blocked' : status;
  }
  return status;
}

function normalizeArtifacts(root: any, artifacts: any = []) {
  return artifacts.map((artifact: any) => {
    if (typeof artifact !== 'string') return artifact;
    return path.isAbsolute(artifact) ? path.relative(root, artifact).split(path.sep).join('/') : artifact;
  });
}

async function runPostRouteRetention(root: any, missionId: any) {
  try {
    const result = await enforceRetention(root, {
      afterRoute: true,
      completedMissionId: missionId,
      pruneReportLogs: false,
      policy: { max_tmp_age_hours: 0 }
    });
    return {
      ok: true,
      action_count: result.actions.length,
      cleanup_report: '.sneakoscope/reports/retention-cleanup.json',
      storage_report: '.sneakoscope/reports/storage.json'
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || String(err)
    };
  }
}
