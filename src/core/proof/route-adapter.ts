import path from 'node:path';
import { collectProofEvidence } from './evidence-collector.js';
import { writeCompletionProof } from './proof-writer.js';
import { normalizeProofRoute, routeRequiresImageVoxelAnchors } from './route-proof-policy.js';
import { linkProofClaimsToEvidence, proofEvidenceSummary } from '../evidence/evidence-proof-linker.js';
import { writeTrustArtifactsForProof } from '../trust-kernel/trust-report.js';
import { enforceRetention } from '../retention.js';
import { sksPrefixedDollarCommand } from '../routes/dollar-prefix.js';

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
  failureAnalysis = null,
  nextHumanActions = [],
  lightweightEvidence = false,
  executionClass = null,
  statusHintRejected = null
}: any = {}) {
  const collected = lightweightEvidence ? { files: [] } : await collectProofEvidence(root);
  const normalizedRoute = normalizeProofRoute(route);
  const publicRoute = normalizedRoute?.startsWith('$')
    ? sksPrefixedDollarCommand(normalizedRoute)
    : normalizedRoute;
  const mergedEvidence = {
    ...collected,
    ...evidence,
    route_gate: gate || evidence.route_gate || null,
    artifacts: normalizeArtifacts(root, artifacts)
  };
  const normalizedStatus = normalizeRouteProofStatus(status, {
    route: publicRoute,
    evidence: mergedEvidence,
    blockers,
    unverified
  });
  const written = await writeCompletionProof(root, {
    execution_class: executionClass,
    mission_id: missionId,
    route: publicRoute,
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
    ...(statusHintRejected ? { status_hint_rejected: statusHintRejected } : {}),
    failure_analysis: normalizeFailureAnalysis(failureAnalysis || evidence.failure_analysis || evidence.root_cause_analysis),
    next_human_actions: nextHumanActions
  }, {
    command: {
      cmd: `sks proof route ${missionId || 'latest'}`,
      route: publicRoute,
      status: normalizedStatus
    }
  });
  if (lightweightEvidence) return { ...written, trust: null, retention: null };
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
      route: publicRoute,
      status: firstTrust.report?.status || normalizedStatus
    }
  });
  const trust = await writeTrustArtifactsForProof(root, enriched.proof);
  const retention = await runPostRouteRetention(root, missionId);
  return { ...enriched, trust, retention };
}

function normalizeFailureAnalysis(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      status: 'not_required',
      root_cause: null,
      corrective_action: null,
      evidence: []
    };
  }
  return {
    status: value.status || 'complete',
    root_cause: value.root_cause || value.cause || null,
    corrective_action: value.corrective_action || value.fix || value.correction || null,
    evidence: value.evidence || value.proof || value.references || []
  };
}

function normalizeRouteProofStatus(status: any, { route, evidence, blockers, unverified }: any) {
  if (status === 'mock_only') return 'mock_only';
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
      skipSksTempSweep: true
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
