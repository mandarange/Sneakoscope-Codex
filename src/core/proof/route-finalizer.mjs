import { collectProofEvidence } from './evidence-collector.mjs';
import { writeRouteCompletionProof } from './route-adapter.mjs';
import { routeFinalizerPolicy } from './route-finalizer-policy.mjs';
import { ensureRouteImageEvidence } from '../wiki-image/route-image-evidence.mjs';
import { readScoutProofEvidence } from '../scouts/scout-proof-evidence.mjs';
import { computerUseStatusReport } from '../computer-use-status.mjs';

export async function finalizeRouteWithProof(root, {
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
} = {}) {
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
  const computerUse = policy.requires_image_voxel_anchors
    ? await computerUseStatusReport().catch((err) => ({ schema: 'sks.computer-use-status.v1', status: 'unknown', ok: false, guidance: [err.message], evidence: { status: 'unknown' } }))
    : null;
  if (computerUse && computerUse.status !== 'available') {
    unverified.push(`Computer Use evidence unavailable: ${computerUse.status}. Visual claim remains verified_partial unless explicit screenshot/image evidence covers it.`);
  }
  const visualComputerUseDowngrade = Boolean(computerUse && computerUse.status !== 'available' && statusHint === 'verified');
  const status = localBlockers.length
    ? (strict ? 'blocked' : statusHint === 'verified' ? 'verified_partial' : statusHint)
    : visualComputerUseDowngrade ? 'verified_partial'
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
    ...(computerUse ? { computer_use: {
      schema: computerUse.schema,
      status: computerUse.status,
      ok: Boolean(computerUse.ok),
      mad_sks_independent: computerUse.mad_sks_independent === true,
      external_capability_blocked: computerUse.external_capability_blocked === true,
      evidence: computerUse.evidence || null
    } } : {}),
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
      ...(imageEvidence?.mock ? ['Image voxel evidence is mock fixture evidence and does not claim a real visual run.'] : [])
    ],
    blockers: localBlockers,
    summary: {
      files_changed: collected.files?.length || 0,
      commands_run: evidence.commands?.length || 0,
      tests_passed: Array.isArray(testEvidence) ? testEvidence.filter((row) => row.ok).length : 0,
      tests_failed: Array.isArray(testEvidence) ? testEvidence.filter((row) => row.ok === false).length : 0,
      manual_review_required: status !== 'verified'
    }
  });
}
