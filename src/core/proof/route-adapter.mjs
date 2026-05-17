import path from 'node:path';
import { collectProofEvidence } from './evidence-collector.mjs';
import { writeCompletionProof } from './proof-writer.mjs';
import { normalizeProofRoute, routeRequiresImageVoxelAnchors } from './route-proof-policy.mjs';

export async function writeRouteCompletionProof(root, {
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
} = {}) {
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
  return writeCompletionProof(root, {
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
}

function normalizeRouteProofStatus(status, { route, evidence, blockers, unverified }) {
  if (blockers?.length) return status === 'failed' ? 'failed' : 'blocked';
  if (status === 'verified' && unverified?.length) return 'verified_partial';
  if (routeRequiresImageVoxelAnchors(route)) {
    const anchors = evidence?.image_voxels?.anchors ?? evidence?.image_voxels?.anchor_count ?? 0;
    if (Number(anchors) <= 0) return status === 'verified' ? 'blocked' : status;
  }
  return status;
}

function normalizeArtifacts(root, artifacts = []) {
  return artifacts.map((artifact) => {
    if (typeof artifact !== 'string') return artifact;
    return path.isAbsolute(artifact) ? path.relative(root, artifact).split(path.sep).join('/') : artifact;
  });
}
