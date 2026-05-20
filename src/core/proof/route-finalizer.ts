import { collectProofEvidence } from './evidence-collector.js';
import { writeRouteCompletionProof } from './route-adapter.js';
import { routeFinalizerPolicy } from './route-finalizer-policy.js';
import { ensureRouteImageEvidence } from '../wiki-image/route-image-evidence.js';
import { readScoutProofEvidence } from '../scouts/scout-proof-evidence.js';
import { wrongnessProofEvidence } from '../triwiki-wrongness/wrongness-proof-linker.js';
import { computerUseStatusReport } from '../computer-use-status.js';
import { readComputerUseLiveEvidence } from '../computer-use-live-evidence.js';

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
  const providedVisualEvidence = visualEvidence;
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
  const computerUse = policy.requires_image_voxel_anchors
    ? await computerUseStatusReport().catch((err: any) => ({ schema: 'sks.computer-use-status.v1', status: 'unknown', ok: false, guidance: [err.message], evidence: { status: 'unknown' } }))
    : null;
  const computerUseLive = policy.requires_image_voxel_anchors
    ? await readComputerUseLiveEvidence(root, { missionId }).catch(() => ({ ok: false, path: null, evidence: null }))
    : null;
  if (computerUse && computerUse.status !== 'available') {
    unverified.push(`Computer Use evidence unavailable: ${computerUse.status}. Visual claim remains verified_partial unless explicit screenshot/image evidence covers it.`);
  }
  if (computerUse && !computerUseLive?.evidence) {
    unverified.push('Computer Use live evidence is missing for this visual route; high-confidence visual claims require live evidence or explicit screenshot/image coverage.');
    if (strict) localBlockers.push('computer_use_live_evidence_missing');
  }
  if (computerUseLive?.evidence?.mode === 'probe_only') {
    unverified.push('Computer Use evidence mode is probe_only; visual claim confidence is capped below high confidence.');
  }
  if (computerUseLive?.evidence?.mode === 'live_capture_blocked') {
    unverified.push(`Computer Use live capture blocked: ${(computerUseLive.evidence.blockers || []).join(',') || computerUseLive.evidence.status}.`);
  }
  if (computerUseLive?.evidence && computerUseLive.evidence.image_voxel?.linked !== true && statusHint === 'verified') {
    unverified.push(`Computer Use live evidence is not linked to Image Voxel: ${computerUseLive.evidence.image_voxel?.reason || 'missing_relation'}.`);
  }
  if (Number(wrongnessEvidence?.high_severity_active || 0) > 0) {
    localBlockers.push('active_high_severity_wrongness');
  }
  const visualComputerUseDowngrade = Boolean(statusHint === 'verified' && (
    (computerUse && computerUse.status !== 'available')
    || !computerUseLive?.evidence
    || computerUseLive.evidence.mode !== 'live_capture_success'
    || computerUseLive.evidence.image_voxel?.linked !== true
  ));
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
    ...(providedVisualEvidence?.image_ux_review ? { image_ux_review: providedVisualEvidence.image_ux_review } : {}),
    ...(scoutEvidence ? { scouts: scoutEvidence } : {}),
    ...(wrongnessEvidence ? { wrongness: wrongnessEvidence } : {}),
    ...(computerUse ? { computer_use: {
      schema: computerUse.schema,
      status: computerUse.status,
      ok: Boolean(computerUse.ok),
      mad_sks_independent: computerUse.mad_sks_independent === true,
      external_capability_blocked: computerUse.external_capability_blocked === true,
      evidence_mode: computerUseLive?.evidence?.mode || 'missing',
      live_evidence_path: computerUseLive?.path || null,
      image_voxel_linked: computerUseLive?.evidence?.image_voxel?.linked === true,
      evidence: computerUse.evidence || null,
      live_evidence: computerUseLive?.evidence || null
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
