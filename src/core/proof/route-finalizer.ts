import { collectProofEvidence } from './evidence-collector.js';
import { writeRouteCompletionProof } from './route-adapter.js';
import { routeFinalizerPolicy } from './route-finalizer-policy.js';
import { ensureRouteImageEvidence } from '../wiki-image/route-image-evidence.js';
import { readAgentProofEvidence } from '../agents/agent-proof-evidence.js';
import { wrongnessProofEvidence } from '../triwiki-wrongness/wrongness-proof-linker.js';
import { computerUseStatusReport } from '../computer-use-status.js';
import { readComputerUseLiveEvidence } from '../computer-use-live-evidence.js';
import { leanChangeEvidenceFromReport, scanCodeStructure } from '../code-structure.js';

export async function finalizeRouteWithProof(root: any, {
  missionId,
  route,
  gateFile = null,
  gate = null,
  artifacts = [],
  visualEvidence = null,
  dbEvidence = null,
  madSksEvidence = null,
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
  visualClaim = undefined,
  agents = undefined,
  allowActiveWrongnessPartial = false,
  failureAnalysis = null,
  lightweightEvidence = false,
  statusHintRejected = null
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
  const collected = lightweightEvidence ? { files: [] } : await collectProofEvidence(root);
  const leanEngineeringEvidence = await collectLeanEngineeringEvidence(root, lightweightEvidence).catch((err: any) => ({
    schema: 'sks.lean-change-evidence.v1',
    status: 'not_collected',
    reason: err?.message || String(err || 'unknown_error')
  }));
  const agentEvidence = agents === false ? null : await readAgentProofEvidence(root, missionId).catch(() => null);
  const wrongnessEvidence = lightweightEvidence ? null : await wrongnessProofEvidence(root, missionId, { route: policy.route }).catch(() => null);
  const requiresNativeComputerUseLiveEvidence = ['$Computer-Use', '$CU'].includes(String(policy.route || ''));
  const computerUse = requiresNativeComputerUseLiveEvidence
    ? await computerUseStatusReport().catch((err: any) => ({ schema: 'sks.computer-use-status.v1', status: 'unknown', ok: false, guidance: [err.message], evidence: { status: 'unknown' } }))
    : null;
  const computerUseLive = requiresNativeComputerUseLiveEvidence
    ? await readComputerUseLiveEvidence(root, { missionId }).catch(() => ({ ok: false, path: null, evidence: null }))
    : null;
  if (computerUse && computerUse.status !== 'available') {
    unverified.push(`Native Computer Use evidence unavailable: ${computerUse.status}. Native visual claim remains verified_partial unless explicit screenshot/image evidence covers it.`);
  }
  if (computerUse && !computerUseLive?.evidence) {
    unverified.push('Native Computer Use live evidence is missing for this Computer Use route; high-confidence native visual claims require live evidence or explicit screenshot/image coverage.');
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
    if (allowActiveWrongnessPartial) {
      unverified.push('Active high-severity wrongness memory remains; this reference-only closeout is capped at verified_partial and does not claim full route verification.');
    } else {
      localBlockers.push('active_high_severity_wrongness');
    }
  }
  const visualComputerUseDowngrade = Boolean(requiresNativeComputerUseLiveEvidence && statusHint === 'verified' && (
    (computerUse && computerUse.status !== 'available')
    || !computerUseLive?.evidence
    || computerUseLive.evidence.mode !== 'live_capture_success'
    || computerUseLive.evidence.image_voxel?.linked !== true
  ));
  const status = mock ? 'mock_only'
    : localBlockers.length
    ? (strict ? 'blocked' : statusHint === 'verified' ? 'verified_partial' : statusHint)
    : visualComputerUseDowngrade ? 'verified_partial'
    : statusHint;
  const finalUnverified = [
    ...unverified,
    ...(imageEvidence?.mock ? ['Image voxel evidence is mock fixture evidence and does not claim a real visual run.'] : []),
    ...(Number(wrongnessEvidence?.medium_severity_active || 0) > 0 ? ['Active medium-severity wrongness memory remains and prevents full verification claims.'] : [])
  ];
  const resolvedFailureAnalysis = failureAnalysis || inferRouteFailureAnalysis({
    missionId,
    route: policy.route,
    status,
    blockers: localBlockers,
    unverified: finalUnverified,
    wrongnessEvidence,
    imageEvidence,
    agentEvidence,
    computerUse,
    computerUseLive,
    visualComputerUseDowngrade
  });
  const evidence = {
    ...collected,
    ...(dbEvidence ? { db: dbEvidence } : {}),
    ...(madSksEvidence ? { mad_sks: madSksEvidence } : {}),
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
    ...(providedVisualEvidence?.ppt_review ? { ppt_review: providedVisualEvidence.ppt_review } : {}),
    ...(providedVisualEvidence?.dfix ? { dfix: providedVisualEvidence.dfix } : {}),
    ...(agentEvidence ? { agents: agentEvidence } : {}),
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
    lean_engineering: leanEngineeringEvidence,
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
    unverified: finalUnverified,
    blockers: localBlockers,
    failureAnalysis: resolvedFailureAnalysis,
    lightweightEvidence,
    executionClass: mock ? 'mock_fixture' : 'real',
    statusHintRejected,
    summary: {
      files_changed: collected.files?.length || 0,
      commands_run: evidence.commands?.length || 0,
      tests_passed: Array.isArray(testEvidence) ? testEvidence.filter((row: any) => row.ok).length : 0,
      tests_failed: Array.isArray(testEvidence) ? testEvidence.filter((row: any) => row.ok === false).length : 0,
      manual_review_required: status !== 'verified'
    }
  });
}

async function collectLeanEngineeringEvidence(root: any, lightweightEvidence: boolean) {
  if (lightweightEvidence) {
    return leanChangeEvidenceFromReport({
      changed_scope: {
        mode: 'lightweight',
        base: 'HEAD',
        changed_files: [],
        files_added: 0,
        files_deleted: 0,
        lines_added: 0,
        lines_deleted: 0,
        net_lines: 0,
        source_files: [],
        entries: []
      },
      semantic_review: {
        status: 'needs-review',
        findings: [{ tag: 'verify', severity: 'review', summary: 'lightweight proof skipped changed-scope code-structure scan' }]
      }
    });
  }
  const report = await scanCodeStructure(root, { changed: true });
  return leanChangeEvidenceFromReport(report);
}

function inferRouteFailureAnalysis({
  missionId,
  route,
  status,
  blockers,
  unverified,
  wrongnessEvidence,
  imageEvidence,
  agentEvidence,
  computerUse,
  computerUseLive,
  visualComputerUseDowngrade
}: any = {}) {
  if (status === 'verified' && !blockers?.length && !unverified?.length) return null;
  const evidence = [
    missionId ? `.sneakoscope/missions/${missionId}/completion-proof.json#unverified` : 'completion-proof.json#unverified',
    ...(wrongnessEvidence?.mission_ledger ? [wrongnessEvidence.mission_ledger] : []),
    ...(agentEvidence ? [missionId ? `.sneakoscope/missions/${missionId}/agents/agent-proof-evidence.json` : 'agents/agent-proof-evidence.json'] : []),
    ...(imageEvidence?.ledger ? ['image_voxels'] : []),
    ...(computerUse ? ['computer_use_status'] : []),
    ...(computerUseLive?.path ? [computerUseLive.path] : [])
  ];
  if (blockers?.length) {
    return {
      status: 'complete',
      root_cause: `Route ${route || 'unknown'} could not be fully verified because finalization recorded blocking conditions: ${blockers.join(', ')}.`,
      corrective_action: 'Preserved the non-verified completion status, recorded blockers in Completion Proof, and linked the available route evidence instead of claiming full completion.',
      evidence
    };
  }
  if (Number(wrongnessEvidence?.medium_severity_active || 0) > 0) {
    return {
      status: 'complete',
      root_cause: `Route ${route || 'unknown'} remains verified_partial because active medium-severity wrongness memory is still present even though no high-severity blocker remains.`,
      corrective_action: 'Kept the Completion Proof at verified_partial, recorded the wrongness caveat in unverified evidence, and avoided a full verified claim until the memory is resolved or explicitly accepted.',
      evidence
    };
  }
  if (visualComputerUseDowngrade) {
    return {
      status: 'complete',
      root_cause: 'Native Computer Use visual confidence was downgraded because live capture or Image Voxel linkage was unavailable or incomplete.',
      corrective_action: 'Kept the Completion Proof at verified_partial and recorded the missing native visual evidence instead of claiming high-confidence visual verification.',
      evidence
    };
  }
  if (imageEvidence?.mock) {
    return {
      status: 'complete',
      root_cause: 'Visual evidence was produced from a mock fixture, which cannot support a real fully verified visual route claim.',
      corrective_action: 'Kept the Completion Proof at verified_partial and recorded the mock-evidence caveat in unverified evidence.',
      evidence
    };
  }
  return {
    status: 'complete',
    root_cause: `Route ${route || 'unknown'} generated a non-verified completion status because unresolved caveats remained in final unverified evidence.`,
    corrective_action: 'Recorded those caveats in Completion Proof and preserved the partial status instead of upgrading the route to verified.',
    evidence
  };
}
