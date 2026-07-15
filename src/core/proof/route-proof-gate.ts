import { containsPlaintextSecret } from '../secret-redaction.js';
import { readRouteProof } from './proof-reader.js';
import { validateCompletionProof } from './validation.js';
import { normalizeProofRoute, proofStatusBlocks, routeRequiresCompletionProof, routeRequiresImageVoxelAnchors } from './route-proof-policy.js';
import { routeRequiresOfficialSubagents } from '../agents/agent-plan.js';
import { rootCauseAnalysisIssue } from './root-cause-policy.js';

export async function validateRouteCompletionProof(root: any, { missionId = null, route = null, state = {}, visualClaim = undefined }: any = {}) {
  const proofRequired = state.proof_required === true || routeRequiresCompletionProof(route);
  if (!proofRequired) return { ok: true, required: false, status: 'not_required', issues: [] };
  const proof: any = await readRouteProof(root, missionId);
  if (!proof) {
    return {
      ok: false,
      required: true,
      status: 'blocked',
      issues: ['completion_proof_missing']
    };
  }
  const validation = validateCompletionProof(proof);
  const issues = [...validation.issues];
  if (proofStatusBlocks(proof.status)) issues.push(`proof_status_${proof.status}`);
  if (containsPlaintextSecret(proof)) issues.push('plaintext_secret');
  if (routeRequiresImageVoxelAnchors(route || proof.route, { visualClaim })) {
    const anchors = proof.evidence?.image_voxels?.anchors ?? proof.evidence?.image_voxels?.anchor_count ?? 0;
    if (Number(anchors) <= 0) issues.push('image_voxel_anchors_missing');
  }
  const normalizedRoute = normalizeProofRoute(route || proof.route);
  const officialSubagentsRequired = state.subagents_required === true
    || proof.evidence?.route_gate?.workflow === 'official_codex_subagent'
    || routeRequiresOfficialSubagents(normalizedRoute || route || proof.route, { task: state.prompt });
  if (officialSubagentsRequired) {
    const routeGate = proof.evidence?.route_gate;
    if (!routeGate) issues.push('official_subagent_route_gate_missing');
    else {
      if (routeGate.workflow !== 'official_codex_subagent') issues.push('official_subagent_workflow_missing');
      if (routeGate.official_subagent_evidence !== true) issues.push('official_subagent_evidence_missing');
      if (routeGate.parent_summary_present !== true) issues.push('official_subagent_parent_summary_missing');
    }
  }
  const wrongness = proof.evidence?.wrongness;
  const imageUxReferenceOnlyPartial = proof.status === 'verified_partial' && proof.evidence?.image_ux_review?.reference_only === true;
  if (Number(wrongness?.high_severity_active || 0) > 0 && !imageUxReferenceOnlyPartial) issues.push('active_wrongness_high');
  if (proof.status === 'verified' && Number(wrongness?.active_count || 0) > 0) issues.push('active_wrongness_requires_partial');
  const rootCauseIssue = rootCauseAnalysisIssue(proof, issues);
  if (rootCauseIssue) issues.push(rootCauseIssue);
  return {
    ok: issues.length === 0,
    required: true,
    status: issues.length ? 'blocked' : proof.status,
    issues,
    proof
  };
}
