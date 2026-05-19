import { collectProofEvidence } from './evidence-collector.js';
import { writeRouteCompletionProof } from './route-adapter.js';
import { routeFinalizerPolicy } from './route-finalizer-policy.js';
import { ensureRouteImageEvidence } from '../wiki-image/route-image-evidence.js';
import { readScoutProofEvidence } from '../scouts/scout-proof-evidence.js';
import { wrongnessProofEvidence } from '../triwiki-wrongness/wrongness-proof-linker.js';

export async function finalizeRouteWithProof(root: any, {
  missionId,
  route,
  gateFile = null,
  gate = null,
  artifacts = [],
  visualEvidence = null,
  dbEvidence = null,
  testEvidence = null,
  commandEvidence = null,
  claims = [],
  unverified = [],
  blockers = [],
  statusHint = 'verified_partial',
  strict = false,
  mock = false,
  fixClaim = false,
  requireRelation = false,
  visualClaim = undefined
}: any = {}) {
  const policy = routeFinalizerPolicy(route, { strict, fixClaim, requireRelation, visualClaim });
  const localBlockers = [...blockers];
  let imageEvidence = visualEvidence;
  if (policy.requires_image_voxel_anchors) {
    imageEvidence = await ensureRouteImageEvidence(root, {
      missionId,
      route: policy.route,
      mock,
      requireRelation: policy.requires_before_after_relation,
      source: 'route-finalizer'
    });
    if (!imageEvidence.ok) {
      localBlockers.push(...(imageEvidence.issues?.length ? imageEvidence.issues : ['image_voxel_anchors_missing']));
    }
  }
  const collected = await collectProofEvidence(root);
  const scoutEvidence = await readScoutProofEvidence(root, missionId).catch(() => null);
  const wrongnessEvidence = await wrongnessProofEvidence(root, missionId).catch(() => null);
  if (Number(wrongnessEvidence?.high_severity_active || 0) > 0) {
    localBlockers.push('active_high_severity_wrongness');
  }
  const status = localBlockers.length
    ? (strict ? 'blocked' : statusHint === 'verified' ? 'verified_partial' : statusHint)
    : statusHint;
  const evidence = {
    ...collected,
    ...(dbEvidence ? { db: dbEvidence } : {}),
    ...(testEvidence ? { tests: testEvidence } : {}),
    ...(commandEvidence ? { commands: commandEvidence } : {}),
    ...(imageEvidence?.ledger ? { image_voxels: {
      schema: 'sks.image-voxel-summary.v1',
      status: imageEvidence.status || 'verified_partial',
      ok: imageEvidence.ok,
      images: imageEvidence.ledger.images?.length || 0,
      anchors: imageEvidence.ledger.anchors?.length || 0,
      anchor_count: imageEvidence.ledger.anchors?.length || 0,
      relations: imageEvidence.ledger.relations?.length || 0,
      mock: Boolean(imageEvidence.mock)
    } } : {}),
    ...(scoutEvidence ? { scouts: scoutEvidence } : {}),
    ...(wrongnessEvidence ? { wrongness: wrongnessEvidence } : {}),
    route_gate: gate || (gateFile ? { source: gateFile } : null)
  };
  return writeRouteCompletionProof(root, {
    missionId,
    route: policy.route,
    status,
    gate: evidence.route_gate,
    artifacts,
    evidence,
    claims,
    unverified: [
      ...unverified,
      ...(imageEvidence?.mock ? ['Image voxel evidence is mock fixture evidence and does not claim a real visual run.'] : []),
      ...(Number(wrongnessEvidence?.medium_severity_active || 0) > 0 ? ['Active medium-severity wrongness memory remains and prevents full verification claims.'] : [])
    ],
    blockers: localBlockers,
    summary: {
      files_changed: collected.files?.length || 0,
      commands_run: evidence.commands?.length || 0,
      tests_passed: Array.isArray(testEvidence) ? testEvidence.filter((row: any) => row.ok).length : 0,
      tests_failed: Array.isArray(testEvidence) ? testEvidence.filter((row: any) => row.ok === false).length : 0,
      manual_review_required: status !== 'verified'
    }
  });
}
